import { apiConfig } from "../bridge-api/config";
import { ARCUS_HOST } from "./hosting";
export const FACILITATOR = "https://facilitator.arcusnetwork.co";
export const PRICE = "0.007";
export const ORIGIN = `https://${ARCUS_HOST}`;
export function arcusConfig() {
  const shared = apiConfig("direct");
  return {
    ...shared,
    enabled: shared.configured,
    origin: ORIGIN,
    price: PRICE,
    atomicPrice: "7000",
  };
}
