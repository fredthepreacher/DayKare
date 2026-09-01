import {
  getMonetizationProduct,
  type VerifiedTransaction,
} from "./monetization";

export type CheckoutResult = VerifiedTransaction;
export interface PaymentProvider {
  readonly name: string;
  checkout(productId: string): Promise<CheckoutResult>;
  restore(): Promise<VerifiedTransaction[]>;
}

export class PaymentUnavailableError extends Error {}

export class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = "unavailable";
  async checkout(): Promise<CheckoutResult> {
    throw new PaymentUnavailableError(
      "Real payments are not configured. No charge was attempted.",
    );
  }
  async restore() {
    return [];
  }
}

/**
 * Preview-only adapter. It simulates a provider-verified receipt but never
 * handles money, account credentials, card data, or production entitlements.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "sandbox";
  async checkout(productId: string): Promise<CheckoutResult> {
    if (!getMonetizationProduct(productId))
      throw new Error("Unknown catalog product");
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    return {
      id: `sandbox-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      productId,
      provider: "sandbox",
      status: "verified",
      verifiedAt: Date.now(),
      sandbox: true,
    };
  }
  async restore() {
    return [];
  }
}

export function sandboxCheckoutAllowed() {
  if (typeof window === "undefined") return false;
  return (
    import.meta.env.DEV ||
    window.location.hostname === "localhost" ||
    window.location.hostname.endsWith(".vercel.app")
  );
}

export const paymentProvider: PaymentProvider = sandboxCheckoutAllowed()
  ? new SandboxPaymentProvider()
  : new UnavailablePaymentProvider();
