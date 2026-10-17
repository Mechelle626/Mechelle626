export const identityStates = [
  "not_started",
  "pending_review",
  "under_review",
  "verified",
  "additional_information_required",
  "rejected",
] as const;
export const documentTypes = [
  "selfie",
  "institution_id",
  "passport",
  "drivers_license",
  "national_id",
  "government_id",
] as const;
export type DocumentType = (typeof documentTypes)[number];
export const statusLabels: Record<string, string> = {
  not_started: "Not started",
  collecting: "Documents needed",
  pending_review: "Pending Review",
  under_review: "Under Review",
  verified: "Verified",
  additional_information_required: "Additional Information Required",
  rejected: "Rejected",
  superseded: "Superseded",
};
export type IdentityStatus = {
  required: boolean;
  status: string;
  selfieStatus: string;
  configured: boolean;
  request: {
    id: string;
    status: string;
    notes: string | null;
    schoolId: string | null;
    institutionName: string;
    role: string;
    documents: {
      id: string;
      type: DocumentType;
      status: string;
      scanStatus: string;
      uploadedAt: string;
    }[];
  } | null;
};
