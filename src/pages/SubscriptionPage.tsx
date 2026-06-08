import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Leaf, RefreshCw, Smartphone, Star } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  isNativePlatform,
  getSubscriptionStatus,
  getOfferings,
  purchasePackage,
  restorePurchases,
  type OfferedPackage,
  type SubscriptionStatus,
} from '../lib/purchases';

const FEATURES = [
  'Unlimited personal recipe collection',
  'Weekly meal planning',
  'Smart grocery lists',
  'Submit recipes to Plantiful',
  'Favorites & sync across devices',
  'Priority support',
];

export function SubscriptionPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubscriptionStatus>('unknown');
  const [packages, setPackages] = useState<OfferedPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<OfferedPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const native = isNativePlatform();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, pkgs] = await Promise.all([getSubscriptionStatus(), getOfferings()]);
      setStatus(s);
      setPackages(pkgs);
      // Default select annual if available, else first package
      const annual = pkgs.find((p) => p.period === 'annual');
      setSelectedPkg(annual ?? pkgs[0] ?? null);
      setLoading(false);
    }
    load();
  }, []);

  async function handlePurchase() {
    if (!selectedPkg) return;
    setError(null);
    setPurchasing(true);
    try {
      const success = await purchasePackage(selectedPkg);
      if (success) {
        setStatus('premium');
        setSuccessMsg('Welcome to Plantiful Premium!');
      }
    } catch {
      setError('Purchase failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setError(null);
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setStatus('premium');
        setSuccessMsg('Your subscription has been restored!');
      } else {
        setError('No previous purchases found for this account.');
      }
    } catch {
      setError('Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  const monthlyPkg = packages.find((p) => p.period === 'monthly');
  const annualPkg = packages.find((p) => p.period === 'annual');

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-6 sm:py-8">
      <div className="max-w-lg mx-auto px-4 sm:px-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-6 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 mb-4 shadow-lg">
            <Leaf className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Plantiful Premium</h1>
          <p className="text-gray-600 text-sm sm:text-base">The full plant-based cooking experience</p>
        </div>

        {/* Already premium */}
        {status === 'premium' && (
          <div className="bg-teal-600 text-white rounded-2xl p-6 mb-6 text-center shadow-lg">
            <Star className="w-8 h-8 mx-auto mb-2 fill-white" />
            <h2 className="text-lg font-bold mb-1">You're on Premium</h2>
            <p className="text-teal-100 text-sm">You have full access to all Plantiful features.</p>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 mb-6 text-sm font-medium text-center">
            {successMsg}
          </div>
        )}

        {/* Features */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6 mb-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">What's included</h2>
          <ul className="space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-teal-600" />
                </span>
                <span className="text-sm text-gray-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing — native only */}
        {!native && status !== 'premium' && (
          <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6 mb-5 text-center">
            <Smartphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h2 className="text-base font-bold text-gray-900 mb-2">Available in the app</h2>
            <p className="text-sm text-gray-600">
              Subscriptions are purchased through the iOS App Store or Google Play Store.
              Download the Plantiful app to get started.
            </p>
          </div>
        )}

        {native && status !== 'premium' && (
          <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6 mb-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Choose a plan</h2>

            {loading ? (
              <div className="text-center py-4 text-gray-500 text-sm">Loading plans...</div>
            ) : packages.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No plans available right now. Please try again later.
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                {[annualPkg, monthlyPkg].filter(Boolean).map((pkg) => {
                  if (!pkg) return null;
                  const isSelected = selectedPkg?.id === pkg.id;
                  const isAnnual = pkg.period === 'annual';
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPkg(pkg)}
                      className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {isAnnual ? 'Annual' : 'Monthly'}
                            {isAnnual && (
                              <span className="ml-2 text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
                                Best value
                              </span>
                            )}
                          </p>
                          {isAnnual && monthlyPkg && (
                            <p className="text-xs text-gray-500">
                              Billed annually
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-900">{pkg.priceString}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 text-center mb-4">{error}</p>
            )}

            <button
              onClick={handlePurchase}
              disabled={!selectedPkg || purchasing || loading}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm shadow-sm"
            >
              {purchasing ? 'Processing...' : 'Subscribe Now'}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
              Payment charged to your {Capacitor.getPlatform() === 'ios' ? 'Apple ID' : 'Google Play'} account.
              Subscription renews automatically. Cancel anytime in your device settings.
            </p>
          </div>
        )}

        {/* Restore */}
        {native && status !== 'premium' && (
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${restoring ? 'animate-spin' : ''}`} />
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </button>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          By subscribing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
