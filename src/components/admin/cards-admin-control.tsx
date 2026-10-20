"use client";

import { useCallback, useState } from "react";
import { BatchActivationCard } from "./batch-activation-card";
import { CardInspectorCard, type AwardSlotMeta } from "./card-inspector-card";

export function CardsAdminControl() {

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [activeInspectedSerial, setActiveInspectedSerial] = useState<string | null>(null);
  const [awards, setAwards] = useState<AwardSlotMeta[] | undefined>(undefined);

  const handleCardSelect = useCallback((serial: string) => {

    setSelectedSerial(serial);
    setActiveInspectedSerial(serial);
  }, []);

  const handleClearSelectedSerial = useCallback(() => {

    setSelectedSerial(null);
  }, []);

  const handleCardInspected = useCallback((serial: string) => {

    setActiveInspectedSerial(serial);
  }, []);

  const handleAwardsLoaded = useCallback((loadedAwards: AwardSlotMeta[]) => {

    if (loadedAwards.length > 0) {
      setAwards(loadedAwards);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
      {/* Left Column: Generated Print Batches Directory */}
      <section aria-label="Print Batches Directory Control" className="w-full lg:col-span-5">
        <BatchActivationCard
          onCardSelect={handleCardSelect}
          selectedSerial={activeInspectedSerial}
          onAwardsLoaded={handleAwardsLoaded}
        />
      </section>

      {/* Right Column: Individual Card Inspection & 1-Card Print Preview */}
      <section aria-label="Individual Card Inspection Control" className="w-full lg:col-span-7">
        <CardInspectorCard
          selectedSerial={selectedSerial}
          onClearSelectedSerial={handleClearSelectedSerial}
          onCardInspected={handleCardInspected}
          defaultAwards={awards}
        />
      </section>
    </div>
  );
}
