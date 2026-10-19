"use client";

import { useState } from "react";
import { BatchActivationCard } from "./batch-activation-card";
import { CardInspectorCard } from "./card-inspector-card";

export function CardsAdminControl() {

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  const handleCardSelect = (serial: string) => {

    setSelectedSerial(serial);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Column One: Batch Activation */}
      <section aria-label="Batch Card Activation Control" className="w-full">
        <BatchActivationCard onCardSelect={handleCardSelect} />
      </section>

      {/* Column Two: Individual Card Inspection */}
      <section aria-label="Individual Card Inspection Control" className="w-full">
        <CardInspectorCard
          selectedSerial={selectedSerial}
          onClearSelectedSerial={() => setSelectedSerial(null)}
        />
      </section>
    </div>
  );
}
