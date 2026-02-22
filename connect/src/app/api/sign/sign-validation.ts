const ALLOWED_MESSAGES = ["vana-master-key-v1"];

const ALLOWED_TYPED_DATA_PRIMARY_TYPES = [
  "ServerRegistration",
  "ServerDeregistration",
];

const ALLOWED_TYPES = ["personal_sign", "eth_signTypedData_v4"] as const;

type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateSignRequest(body: {
  type?: string;
  message?: string;
  typedData?: { primaryType?: string; primary_type?: string };
}): ValidationResult {
  const { type, message, typedData } = body;

  if (!type || !(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return { valid: false, reason: "Invalid signing type" };
  }

  if (type === "personal_sign") {
    if (!message || !ALLOWED_MESSAGES.includes(message)) {
      return { valid: false, reason: "Message not in allowlist" };
    }
  }

  if (type === "eth_signTypedData_v4") {
    // Accept both EIP-712 standard `primaryType` and Privy's `primary_type`
    const pt = typedData?.primaryType ?? typedData?.primary_type;
    if (!pt || !ALLOWED_TYPED_DATA_PRIMARY_TYPES.includes(pt)) {
      return {
        valid: false,
        reason: "Typed data primaryType not in allowlist",
      };
    }
  }

  return { valid: true };
}
