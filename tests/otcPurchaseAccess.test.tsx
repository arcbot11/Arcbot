import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { OtcPurchaseAccess, settlingPurchaseLabel } from "../components/OtcPurchaseAccess";
vi.stubGlobal("React",React);
afterEach(()=>vi.clearAllMocks());
it("does not guess ownership while recovery is loading or has failed",()=>{
  expect(settlingPurchaseLabel(false,false)).toBe("Checking purchase status");
  expect(settlingPurchaseLabel(false,true)).toBe("Another Purchase Is Processing");
  expect(settlingPurchaseLabel(true,false)).toBe("Purchase Processing");
});
it("lets the current buyer reopen a closed purchase without resubmitting",()=>{
  let open=true;const onView=vi.fn(()=>{open=true;});
  const props={wallet:"0xAbC",activeWallet:"0xabc",onView};
  expect(OtcPurchaseAccess({...props,open})).toBeNull();
  open=false;
  const button=OtcPurchaseAccess({...props,open})!;
  expect(button.props.children).toBe("View purchase");
  expect(button.props.type).toBe("button");
  button.props.onClick();
  expect(open).toBe(true);expect(onView).toHaveBeenCalledTimes(1);
});
it("does not expose the previous wallet's purchase after sign-out or account switch",()=>{
  for(const activeWallet of [undefined,"0xdef"])expect(OtcPurchaseAccess({wallet:"0xabc",activeWallet,open:false,onView:vi.fn()})).toBeNull();
});
