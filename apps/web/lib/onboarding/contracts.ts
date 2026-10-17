import { message as bcText } from "../i18n/source";
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
  not_started: bcText("ui.ba35f0c47d862763"),
  collecting: bcText("ui.3cfd24fecb9ba73d"),
  pending_review: bcText("ui.da77d8f5b71aa068"),
  under_review: bcText("ui.115fe4ba8ea904f7"),
  verified: bcText("ui.4f7838402f37674e"),
  additional_information_required: bcText("ui.31c90eb159c91eab"),
  rejected: bcText("ui.aea4a04a80426ed8"),
  superseded: bcText("ui.e5830d265452f1ed"),
};
export type IdentityStatus = {
  checklist?: {email:boolean;human:boolean;selfie:boolean;document:boolean;scanned:boolean;approved:boolean};
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
