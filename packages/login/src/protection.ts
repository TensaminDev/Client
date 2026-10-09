export const PROTECTION_PURPOSE = {
  passwordManagementSignature: 0x72,
  passwordManagementEncryption: 0x73,
  passwordResponseSignature: 0x74,
  passwordResponseEncryption: 0x75,
  provisioningCredentialSignature: 0x76,
  provisioningCredentialEncryption: 0x77,
} as const;

export const DUAL_SIGNATURE_SUITE = "dual" as const;

export const PROVISIONING_DESCRIPTOR = "provisioning-client" as const;
