"""Independent NumPy/SciPy calculation of the published R-hat/ESS equations."""
import json
import numpy as np
from scipy.stats import rankdata, norm

def rhat(a):
 n=a.shape[1]; w=np.var(a,axis=1,ddof=1).mean(); b=n*np.var(a.mean(axis=1),ddof=1)
 return np.sqrt(((n-1)*w/n+b/n)/w)
def ranknorm(a):
 return norm.ppf((rankdata(a)-.375)/(a.size+.25)).reshape(a.shape)
def ess(a):
 m,n=a.shape; centered=a-a.mean(axis=1)[:,None]
 w=np.var(a,axis=1,ddof=1).mean(); v=(n-1)*w/n+np.var(a.mean(axis=1),ddof=1)
 def rho(lag): return 1-(w-np.sum(centered[:,:n-lag]*centered[:,lag:])/(m*n))/v
 last=1+rho(1); total=last
 for t in range(2,n-1,2):
  pair=rho(t)+rho(t+1)
  if pair<0: break
  last=min(last,pair); total+=last
 return min(m*n*np.log10(m*n),m*n/max(1/np.log10(m*n),-1+2*total))
rng=np.random.default_rng(2837); fixtures=[]
for name in ['independent','autocorrelated','shifted','different-scales','tied']:
 a=rng.normal(size=(4,160))
 if name=='autocorrelated':
  for t in range(1,160): a[:,t]=.85*a[:,t-1]+a[:,t]
 if name=='shifted': a+=np.arange(4)[:,None]*2
 if name=='different-scales': a*=np.array([1,1,1,6])[:,None]
 if name=='tied': a=np.round(a)
 split=a.reshape(8,80); ranks=ranknorm(split); folded=ranknorm(np.abs(split-np.median(split)))
 diag=dict(rhat=float(max(rhat(ranks),rhat(folded))),bulkEss=float(ess(ranks)),tailEss=float(min(ess((split<=np.quantile(split,.05)).astype(float)),ess((split<=np.quantile(split,.95)).astype(float)))))
 fixtures.append(dict(name=name,chains=a.tolist(),expected=diag))
print(json.dumps(fixtures))
