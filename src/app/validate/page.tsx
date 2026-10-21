import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { CardValidator } from '@/components/public/card-validator';

export const metadata: Metadata = {
  title: 'Card Validator | Itechtivity 2027',
  description:
    'Verify the authenticity, activation status, attendee demographics, and award stub redemption history of any Itechtivity 2027 Bingo Card.',
};

export const dynamic = 'force-dynamic';

export default function ValidatePage() {

  return (
    <main className="min-h-dvh flex flex-col justify-between px-4 py-6 max-w-xl mx-auto w-full">
      <div className="space-y-6">
        <header className="flex items-center justify-between border-b border-neutral-300 pb-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-neutral-900 transition-colors min-h-11 px-2 py-1 -ml-2 rounded"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to home</span>
          </Link>

          <Link
            href="/"
            aria-label="Itechtivity 2027 Home"
            className="text-xs font-black tracking-widest uppercase text-neutral-900 select-none"
          >
            ITECHTIVITY <span className="font-light text-neutral-500">2027</span>
          </Link>
        </header>

        <section aria-labelledby="validator-title" className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-neutral-900" />
            <h1
              id="validator-title"
              className="text-base font-bold uppercase tracking-wider text-neutral-900"
            >
              Universal Card Validator
            </h1>
          </div>
          <p className="text-xs text-neutral-600">
            Scan a card master QR or stub QR code, or enter a serial number to inspect validity,
            purchaser registration, and 6-slot vote status.
          </p>
        </section>

        <CardValidator />
      </div>

      <footer className="mt-8 pt-4 border-t border-neutral-200 text-center text-xs text-neutral-500 space-y-1">
        <p>University of Caloocan City — Computer Studies Department</p>
        <p className="font-mono text-[11px] text-neutral-400">
          Itechtivity 2027 Capstone Awards Voting System
        </p>
      </footer>
    </main>
  );
}
