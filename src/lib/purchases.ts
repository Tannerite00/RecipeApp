import { Capacitor } from '@capacitor/core';

// RevenueCat entitlement identifier — must match what you create in the RevenueCat dashboard
export const PREMIUM_ENTITLEMENT = 'premium';

export type SubscriptionStatus = 'unknown' | 'premium' | 'free';

export interface OfferedPackage {
  id: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  period: 'monthly' | 'annual' | 'other';
  // Raw package reference passed back to purchasePackage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

let initialized = false;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Call once on app start, after the user is known (or anonymously). */
export async function initializePurchases(userId?: string): Promise<void> {
  if (!isNativePlatform()) return;
  if (initialized) return;

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const apiKey =
      Capacitor.getPlatform() === 'ios'
        ? (import.meta.env.VITE_REVENUECAT_APPLE_API_KEY as string)
        : (import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY as string);

    if (!apiKey) {
      console.warn('[Purchases] RevenueCat API key not configured.');
      return;
    }

    await Purchases.configure({ apiKey });

    if (userId) {
      await Purchases.logIn({ appUserID: userId });
    }

    initialized = true;
  } catch (err) {
    console.error('[Purchases] Failed to initialize RevenueCat:', err);
  }
}

/** Returns the user's current subscription status. */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  if (!isNativePlatform()) return 'unknown';

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] ? 'premium' : 'free';
  } catch {
    return 'unknown';
  }
}

/** Fetches available subscription packages from RevenueCat. */
export async function getOfferings(): Promise<OfferedPackage[]> {
  if (!isNativePlatform()) return [];

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { offerings } = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];

    return current.availablePackages.map((pkg) => {
      const period: OfferedPackage['period'] =
        pkg.packageType === 'MONTHLY'
          ? 'monthly'
          : pkg.packageType === 'ANNUAL'
            ? 'annual'
            : 'other';

      return {
        id: pkg.identifier,
        productId: pkg.product.identifier,
        title: pkg.product.title,
        description: pkg.product.description,
        priceString: pkg.product.priceString,
        period,
        raw: pkg,
      };
    });
  } catch {
    return [];
  }
}

/** Initiates the native purchase flow for the given package. Returns true on success. */
export async function purchasePackage(pkg: OfferedPackage): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg.raw });
    return !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
  } catch (err: unknown) {
    // User cancelled — not an error worth surfacing
    const code = (err as { code?: string })?.code;
    if (code === 'PURCHASE_CANCELLED') return false;
    throw err;
  }
}

/** Restores previous purchases. Returns true if premium was restored. */
export async function restorePurchases(): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { customerInfo } = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
  } catch {
    return false;
  }
}
