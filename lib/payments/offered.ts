/** Which ways of paying a studio has really set up, for what its public page says. Booleans only: never the details. */
export interface PaymentWays {
  online: boolean;
  qr: boolean;
  bank: boolean;
}

const isSet = (value: string | null | undefined) => !!value && value.trim().length > 0;

export function paymentWaysFor(studio: {
  qrCodeUrl: string | null;
  bankDetails: string | null;
  toyyibpaySecretEnc: string | null;
  toyyibpayCategoryCode: string | null;
}): PaymentWays {
  return {
    // Online payment needs both the key and the category the bills are made under.
    online: isSet(studio.toyyibpaySecretEnc) && isSet(studio.toyyibpayCategoryCode),
    qr: isSet(studio.qrCodeUrl),
    bank: isSet(studio.bankDetails),
  };
}
