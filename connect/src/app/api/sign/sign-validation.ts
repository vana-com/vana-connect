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
  typedData?: { primaryType?: string };
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
    if (
      !typedData?.primaryType ||
      !ALLOWED_TYPED_DATA_PRIMARY_TYPES.includes(typedData.primaryType)
    ) {
      return {
        valid: false,
        reason: "Typed data primaryType not in allowlist",
      };
    }
  }

  return { valid: true };
}
