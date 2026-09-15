import {expect,it} from "vitest";
import {requiredEth} from "../lib/otc/required-eth";
it.each([
  [5582500000000800n,"0.005583"],
  [1000000000000000000n,"1"],
  [1n,"0.000000000000000001"],
  [999990000000000000n,"1"],
])("does not understate the required ETH amount %s",(value,expected)=>expect(requiredEth(value)).toBe(expected));
