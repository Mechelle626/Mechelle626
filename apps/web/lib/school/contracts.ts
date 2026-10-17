import type { roles } from "../auth/contracts";
export type AcademicRole = (typeof roles)[number];
export type SchoolOption = {
  id: string;
  name: string;
  emailRoles: AcademicRole[];
};
export type SchoolRequest = {
  id: string;
  role: AcademicRole;
  method: "email" | "upload" | "camera";
  status:
    | "awaiting_email"
    | "pending_review"
    | "needs_information"
    | "approved"
    | "rejected"
    | "superseded";
  schoolId: string;
  schoolName: string;
  universityEmail: string | null;
  codeExpiresAt: string | null;
  resendAvailableAt: string | null;
  remainingAttempts: number;
  deliveryStatus: "pending" | "sent" | "failed" | null;
  documentScanStatus: "pending" | "clean" | "infected" | "error" | null;
  reason: string | null;
  submittedAt: string;
};
export type SchoolStatus = {
  schoolVerified: boolean;
  verifiedSchool: { name: string; role: AcademicRole } | null;
  role: AcademicRole;
  request: SchoolRequest | null;
  serverNow: string;
  uploadsConfigured: boolean;
  mailMode: string;
};
export const maxDocumentBytes = 10 * 1024 * 1024;
