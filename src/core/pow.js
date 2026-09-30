/* Deterministic power function of the runtime: HeliPow.pow(x, y), a drop-in replacement for Math.pow (and for the
   ** operator) that returns the same double on every platform.

   Why: V8 computes Math.pow and ** with the C library's pow (glibc on Linux, the Microsoft C runtime on Windows), and
   the two do not round alike. Measured on Node 24.19.0 over 200 000 inputs per function (CI of 30/09/2026): pow is the
   only Math function whose results differ between the Linux and Windows builds; sin, cos, tan, atan, atan2, exp,
   expm1, the logarithms, cbrt, the hyperbolic functions, asin, acos, sqrt, hypot and fround agree. The generated
   terrain and the bots that fly over it therefore differed in the last bits between platforms.

   What: a port of e_pow.c of fdlibm 5.3 (Sun Microsystems, 2004; __ieee754_pow, the version netlib distributes) to
   JavaScript, statement for statement, with the same constants (built from the hexadecimal words fdlibm gives as the
   intended values) and the same bit manipulations of the high and low 32-bit words of a double, and one documented
   correction of fdlibm's |y| > 2**31 branch (IVLN2_H21 below; the game never takes that branch). It uses only IEEE-754
   double additions, subtractions, multiplications and divisions, Math.sqrt and Math.abs, which are exact or correctly
   rounded on every conforming engine, plus exact bit copies: the result is a pure function of the two doubles.
   ECMAScript's special cases of Number::exponentiate (ES2025 6.1.6.1.3) are fdlibm's own list, so none needs a patch:
   NaN exponent -> NaN (also for base 1), any base ** +-0 -> 1, (+-1) ** +-Infinity -> NaN, signed zeros and infinities
   by the parity of an integer exponent, a negative finite base with a non-integer exponent -> NaN.
   Accuracy (tests/unit/pow.test.js): under 1 ulp against a 320-bit reference (BigInt arithmetic) on every sampled case
   (at most 0.85 ulp measured over 47.6 million inputs), exact for integer ** integer when the result is representable,
   as fdlibm states. It is not correctly rounded: on generic inputs, the game's ranges included, about 90 % of its
   results are the correctly rounded double and the others its neighbour, one ulp away (the Windows Math.pow it
   replaces is correctly rounded on about 99.8 % of them).

   Integer powers: the runtime writes an integer square as a product (x*x). One rounding of the exact square is the
   correctly rounded result, and it is what this function returns for y == 2 (fdlibm's own special case); any other
   exponent, integer or not, goes through HeliPow.pow. ESLint forbids Math.pow and ** in src/ outside this file. */
(function(root){
  'use strict';
  // Word access: one scratch double viewed as two 32-bit words (high word = sign, exponent, top 20 mantissa bits).
  const F64=new Float64Array(1),U32=new Uint32Array(F64.buffer);
  const LITTLE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
  const HI=LITTLE?1:0,LO=LITTLE?0:1;
  const fromWords=(h,l)=>{U32[HI]=h;U32[LO]=l;return F64[0];};
  const highWord=x=>{F64[0]=x;return U32[HI]|0;};                 // signed, like fdlibm's int
  const clearLow=x=>{F64[0]=x;U32[LO]=0;return F64[0];};          // __LO(x) = 0
  const setHigh=(x,h)=>{F64[0]=x;U32[HI]=h;return F64[0];};       // __HI(x) = h

  // Constants of e_pow.c, from the hexadecimal words fdlibm gives as the intended values (its decimal forms are
  // checked against these by tests/unit/pow.test.js).
  const DP_H1=fromWords(0x3FE2B803,0x40000000);   // 5.84962487220764160156e-01, log2(1.5) high part
  const DP_L1=fromWords(0x3E4CFDEB,0x43CFD006);   // 1.35003920212974897128e-08, log2(1.5) tail
  const TWO53=fromWords(0x43400000,0x00000000);   // 9007199254740992
  const HUGE=1.0e300,TINY=1.0e-300;
  // Polynomial coefficients for (3/2)*(log(x)-2s-2/3*s**3).
  const L1=fromWords(0x3FE33333,0x33333303);      // 5.99999999999994648725e-01
  const L2=fromWords(0x3FDB6DB6,0xDB6FABFF);      // 4.28571428578550184252e-01
  const L3=fromWords(0x3FD55555,0x518F264D);      // 3.33333329818377432918e-01
  const L4=fromWords(0x3FD17460,0xA91D4101);      // 2.72728123808534006489e-01
  const L5=fromWords(0x3FCD864A,0x93C9DB65);      // 2.30660745775561754067e-01
  const L6=fromWords(0x3FCA7E28,0x4A454EEF);      // 2.06975017800338417784e-01
  const P1=fromWords(0x3FC55555,0x5555553E);      // 1.66666666666666019037e-01
  const P2=fromWords(0xBF66C16C,0x16BEBD93);      // -2.77777777770155933842e-03
  const P3=fromWords(0x3F11566A,0xAF25DE2C);      // 6.61375632143793436117e-05
  const P4=fromWords(0xBEBBBD41,0xC5D26BF1);      // -1.65339022054652515390e-06
  const P5=fromWords(0x3E663769,0x72BEA4D0);      // 4.13813679705723846039e-08
  const LG2=fromWords(0x3FE62E42,0xFEFA39EF);     // 6.93147180559945286227e-01
  const LG2_H=fromWords(0x3FE62E43,0x00000000);   // 6.93147182464599609375e-01
  const LG2_L=fromWords(0xBE205C61,0x0CA86C39);   // -1.90465429995776804525e-09
  const OVT=8.0085662595372944372e-17;            // -(1024-log2(ovfl+.5ulp)); fdlibm gives no word form
  const CP=fromWords(0x3FEEC709,0xDC3A03FD);      // 9.61796693925975554329e-01 = 2/(3ln2)
  const CP_H=fromWords(0x3FEEC709,0xE0000000);    // 9.61796700954437255859e-01 = (float)cp
  const CP_L=fromWords(0xBE3E2FE0,0x145B01F5);    // -7.02846165095275826516e-09 = tail of cp_h
  const IVLN2=fromWords(0x3FF71547,0x652B82FE);   // 1.44269504088896338700e+00 = 1/ln2
  const IVLN2_H=fromWords(0x3FF71547,0x60000000); // 1.44269502162933349609e+00 = 24b 1/ln2
  const IVLN2_L=fromWords(0x3E54AE0B,0xF85DDF44); // 1.92596299112661746887e-08 = 1/ln2 tail
  // The one deviation from e_pow.c. Its |y| > 2**31 branch computes u = ivln2_h*t and relies on the product being
  // exact ("ivln2_h has 21 sig. bits", "t has 20 trailing zeros": 21 + 32 bits), but the ivln2_h it uses is the 24-bit
  // constant above, so u is rounded and the rounding error, multiplied by |y| > 2**31, reaches hundreds of ulps (for
  // example pow(0.9999998417230332, 2587260676.57459) came out 124 ulps away from the exact value). That branch uses
  // the 21-bit split the comment describes instead: the high word of 1/ln2 and the correctly rounded rest. Nothing
  // else changes; the game never takes that branch (its exponents stay below 5 in magnitude).
  const IVLN2_H21=fromWords(0x3FF71547,0x00000000); // 1.44269466400146484375e+00 = 21b 1/ln2
  const IVLN2_L21=fromWords(0x3E994AE0,0xBF85DDF4); // 3.76887498563609911454e-07 = 1/ln2 - ivln2_h21
  // s_scalbn.c
  const TWO54=fromWords(0x43500000,0x00000000);   // 1.80143985094819840000e+16
  const TWOM54=fromWords(0x3C900000,0x00000000);  // 5.55111512312578270212e-17

  // scalbn(x, n) = x * 2**n with one rounding (fdlibm s_scalbn.c); pow uses it for a subnormal result.
  function scalbn(x,n){
    F64[0]=x;let hx=U32[HI]|0;const lx=U32[LO];
    let k=(hx&0x7ff00000)>>20;                    // extract exponent
    if(k===0){                                    // 0 or subnormal x
      if((lx|(hx&0x7fffffff))===0)return x;       // +-0
      x*=TWO54;hx=highWord(x);
      k=((hx&0x7ff00000)>>20)-54;
      if(n< -50000)return TINY*x;                 // underflow
    }
    if(k===0x7ff)return x+x;                      // NaN or Inf
    const sign=hx<0?-1:1;                         // copysign(., x)
    k=k+n;
    if(k>0x7fe)return HUGE*(sign*HUGE);           // overflow
    if(k>0)return setHigh(x,(hx&0x800fffff)|(k<<20)); // normal result
    if(k<= -54){
      if(n>50000)return HUGE*(sign*HUGE);         // in case integer overflow in n+k
      return TINY*(sign*TINY);                    // underflow
    }
    k+=54;                                        // subnormal result
    return setHigh(x,(hx&0x800fffff)|(k<<20))*TWOM54;
  }

  // __ieee754_pow(x, y): x**y.
  //   1. log2(x) in two pieces, log2(x) = w1 + w2, where w1 has 53-24 = 29 bit trailing zeros;
  //   2. y*log2(x) = n + y' by simulating multi-precision arithmetic, where |y'| <= 0.5;
  //   3. x**y = 2**n * exp(y'*log2).
  function pow(x,y){
    x=+x;y=+y;                                    // ToNumber, as Math.pow (a BigInt throws a TypeError)
    F64[0]=x;const hx=U32[HI]|0,lx=U32[LO];
    F64[0]=y;const hy=U32[HI]|0,ly=U32[LO];
    let ix=hx&0x7fffffff;const iy=hy&0x7fffffff;
    let j,k,n,z;

    // y==zero: x**0 = 1
    if((iy|ly)===0)return 1;

    // +-NaN return x+y
    if(ix>0x7ff00000||(ix===0x7ff00000&&lx!==0)||iy>0x7ff00000||(iy===0x7ff00000&&ly!==0))return x+y;

    // determine if y is an odd int when x < 0
    // yisint = 0 ... y is not an integer
    // yisint = 1 ... y is an odd int
    // yisint = 2 ... y is an even int
    let yisint=0;
    if(hx<0){
      if(iy>=0x43400000)yisint=2;                 // even integer y
      else if(iy>=0x3ff00000){
        k=(iy>>20)-0x3ff;                         // exponent
        if(k>20){
          j=ly>>>(52-k);
          if(((j<<(52-k))>>>0)===ly)yisint=2-(j&1);
        }else if(ly===0){
          j=iy>>(20-k);
          if((j<<(20-k))===iy)yisint=2-(j&1);
        }
      }
    }

    // special value of y
    if(ly===0){
      if(iy===0x7ff00000){                        // y is +-inf
        if(((ix-0x3ff00000)|lx)===0)return y-y;   // inf**+-1 is NaN
        else if(ix>=0x3ff00000)return hy>=0?y:0;  // (|x|>1)**+-inf = inf,0
        else return hy<0?-y:0;                    // (|x|<1)**-,+inf = inf,0
      }
      if(iy===0x3ff00000){                        // y is +-1
        if(hy<0)return 1/x;else return x;
      }
      if(hy===0x40000000)return x*x;              // y is 2
      if(hy===0x3fe00000){                        // y is 0.5
        if(hx>=0)return Math.sqrt(x);             // x >= +0
      }
    }

    let ax=Math.abs(x);
    // special value of x
    if(lx===0){
      if(ix===0x7ff00000||ix===0||ix===0x3ff00000){
        z=ax;                                     // x is +-0,+-inf,+-1
        if(hy<0)z=1/z;                            // z = (1/|x|)
        if(hx<0){
          if(((ix-0x3ff00000)|yisint)===0){
            z=(z-z)/(z-z);                        // (-1)**non-int is NaN
          }else if(yisint===1)z=-z;               // (x<0)**odd = -(|x|**odd)
        }
        return z;
      }
    }

    n=(hx>>31)+1;

    // (x<0)**(non-int) is NaN
    if((n|yisint)===0)return (x-x)/(x-x);

    let s=1;                                      // s (sign of result -ve**odd) = -1 else = 1
    if((n|(yisint-1))===0)s=-1;                   // (-ve)**(odd int)

    let t1,t2;
    // |y| is huge
    if(iy>0x41e00000){                            // if |y| > 2**31
      if(iy>0x43f00000){                          // if |y| > 2**64, must o/uflow
        if(ix<=0x3fefffff)return hy<0?HUGE*HUGE:TINY*TINY;
        if(ix>=0x3ff00000)return hy>0?HUGE*HUGE:TINY*TINY;
      }
      // over/underflow if x is not close to one
      if(ix<0x3fefffff)return hy<0?s*HUGE*HUGE:s*TINY*TINY;
      if(ix>0x3ff00000)return hy>0?s*HUGE*HUGE:s*TINY*TINY;
      // now |1-x| is tiny <= 2**-20, suffice to compute log(x) by x-x^2/2+x^3/3-x^4/4
      const t=ax-1;                               // t has 20 trailing zeros
      const w=(t*t)*(0.5-t*(0.3333333333333333333333-t*0.25));
      const u=IVLN2_H21*t;                        // ivln2_h has 21 sig. bits (deviation: see IVLN2_H21)
      const v=t*IVLN2_L21-w*IVLN2;
      t1=clearLow(u+v);
      t2=v-(t1-u);
    }else{
      n=0;
      // take care subnormal number
      if(ix<0x00100000){ax*=TWO53;n-=53;ix=highWord(ax);}
      n+=(ix>>20)-0x3ff;
      j=ix&0x000fffff;
      // determine interval
      ix=j|0x3ff00000;                            // normalize ix
      if(j<=0x3988E)k=0;                          // |x|<sqrt(3/2)
      else if(j<0xBB67A)k=1;                      // |x|<sqrt(3)
      else{k=0;n+=1;ix-=0x00100000;}
      ax=setHigh(ax,ix);
      const bp=k?1.5:1,dp_h=k?DP_H1:0,dp_l=k?DP_L1:0;

      // compute ss = s_h+s_l = (x-1)/(x+1) or (x-1.5)/(x+1.5)
      let u=ax-bp;                                // bp[0]=1.0, bp[1]=1.5
      let v=1/(ax+bp);
      const ss=u*v;
      const s_h=clearLow(ss);
      // t_h=ax+bp[k] High
      let t_h=fromWords(((ix>>1)|0x20000000)+0x00080000+(k<<18),0);
      let t_l=ax-(t_h-bp);
      const s_l=v*((u-s_h*t_h)-s_h*t_l);
      // compute log(ax)
      let s2=ss*ss;
      let r=s2*s2*(L1+s2*(L2+s2*(L3+s2*(L4+s2*(L5+s2*L6)))));
      r+=s_l*(s_h+ss);
      s2=s_h*s_h;
      t_h=clearLow(3.0+s2+r);
      t_l=r-((t_h-3.0)-s2);
      // u+v = ss*(1+...)
      u=s_h*t_h;
      v=s_l*t_h+t_l*ss;
      // 2/(3log2)*(ss+...)
      const p_h=clearLow(u+v);
      const p_l=v-(p_h-u);
      const z_h=CP_H*p_h;                         // cp_h+cp_l = 2/(3*log2)
      const z_l=CP_L*p_h+p_l*CP+dp_l;
      // log2(ax) = (ss+..)*2/(3*log2) = n + dp_h + z_h + z_l
      const t=n;
      t1=clearLow(((z_h+z_l)+dp_h)+t);
      t2=z_l-(((t1-t)-dp_h)-z_h);
    }

    // split up y into y1+y2 and compute (y1+y2)*(t1+t2)
    const y1=clearLow(y);
    const p_l=(y-y1)*t1+y*t2;
    let p_h=y1*t1;
    z=p_l+p_h;
    F64[0]=z;j=U32[HI]|0;let i=U32[LO]|0;
    if(j>=0x40900000){                            // z >= 1024
      if(((j-0x40900000)|i)!==0)                  // if z > 1024
        return s*HUGE*HUGE;                       // overflow
      else{
        if(p_l+OVT>z-p_h)return s*HUGE*HUGE;      // overflow
      }
    }else if((j&0x7fffffff)>=0x4090cc00){         // z <= -1075
      if(((j-0xc090cc00)|i)!==0)                  // z < -1075
        return s*TINY*TINY;                       // underflow
      else{
        if(p_l<=z-p_h)return s*TINY*TINY;         // underflow
      }
    }
    // compute 2**(p_h+p_l)
    i=j&0x7fffffff;
    k=(i>>20)-0x3ff;
    n=0;
    if(i>0x3fe00000){                             // if |z| > 0.5, set n = [z+0.5]
      n=(j+(0x00100000>>(k+1)))|0;
      k=((n&0x7fffffff)>>20)-0x3ff;               // new k for n
      const t=fromWords(n&~(0x000fffff>>k),0);
      n=((n&0x000fffff)|0x00100000)>>(20-k);
      if(j<0)n=-n;
      p_h-=t;
    }
    let t=clearLow(p_l+p_h);
    const u=t*LG2_H;
    const v=(p_l-(t-p_h))*LG2+t*LG2_L;
    z=u+v;
    const w=v-(z-u);
    t=z*z;
    t1=z-t*(P1+t*(P2+t*(P3+t*(P4+t*P5))));
    const r=(z*t1)/(t1-2)-(w+z*w);
    z=1-(r-z);
    j=(highWord(z)+(n<<20))|0;
    if((j>>20)<=0)z=scalbn(z,n);                  // subnormal output
    else z=setHigh(z,j);
    return s*z;
  }

  const api=Object.freeze({pow,source:'fdlibm 5.3 e_pow.c'});
  if(typeof module!=='undefined')module.exports=api;else root.HeliPow=api;
})(typeof window!=='undefined'?window:globalThis);
