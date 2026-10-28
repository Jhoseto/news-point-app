import {describe,it,expect} from 'vitest';
import {guardReason,percentile} from './h1-capacity.mjs';
describe('capacity safety guards',()=>{
 const healthy=()=>({health:[{ok:true,ms:80},{ok:true,ms:30}],apache:{idle:100},freeGiB:50,generatorLagMs:20});
 it('keeps hardware headroom distinct from Apache capacity',()=>{const s=healthy();s.apache.idle=19;expect(guardReason(s)).toBe('apache-reserve-low');});
 it('stops on slow or failed health independently of free memory',()=>{const s=healthy();s.health[0].ms=1600;expect(guardReason(s)).toBe('health-degraded');s.health[0]={ok:false,ms:10};expect(guardReason(s)).toBe('health-degraded');});
 it('identifies a generator bottleneck rather than a server ceiling',()=>{const s=healthy();s.generatorLagMs=101;expect(guardReason(s)).toBe('generator-limited');});
 it('accepts healthy baseline and calculates real percentiles',()=>{expect(guardReason(healthy())).toBe(null);expect(percentile([9,1,3,2],.95)).toBe(9);});
});
