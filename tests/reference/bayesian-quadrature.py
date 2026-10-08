import numpy as np
from scipy.special import ndtr
from scipy.integrate import simpson, cumulative_trapezoid
import json
# Independent integration of the observed-data posterior for two characters.
# Integrate tester deviations analytically, then integrate d and tau numerically.
sigma=(25/3)/(np.sqrt(2)*25/6)
d=np.linspace(-12,12,2401); tau=np.linspace(0,9,1801)
prob=ndtr(d[:,None]/np.sqrt(1+2*tau[None,:]**2))
yes,no=14,6
p=np.exp(-d[:,None]**2/(4*sigma**2)-tau[None,:]**2/(2*sigma**2))*prob**yes*(1-prob)**no
pd=simpson(p,x=tau,axis=1); pt=simpson(p,x=d,axis=0)
pd/=simpson(pd,x=d); pt/=simpson(pt,x=tau)
def summary(x,p):
 cdf=cumulative_trapezoid(p,x,initial=0); cdf/=cdf[-1]
 return dict(mean=float(simpson(x*p,x=x)),lower=float(np.interp(.025,cdf,x)),upper=float(np.interp(.975,cdf,x)))
noise=np.sqrt(2)*25/6
print(json.dumps({'source':'SciPy observed-data two-dimensional quadrature; tester effects analytically marginalized','wins':yes,'losses':no,'score':summary(1000+40*noise*d/2,pd/(20*noise)), 'tau':summary(40*noise*tau,pt/(40*noise)),'firstProbability':float(simpson(pd[d>=0],x=d[d>=0]))},indent=2))
