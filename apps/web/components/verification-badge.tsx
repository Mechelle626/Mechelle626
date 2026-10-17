import { message as bcText } from "../lib/i18n/source";
import { Localized } from "./localization";
const badges: Record<string, { icon: string; label: string }> = {
  Student: { icon: "🎓", label: bcText("ui.0ea5870d6eef075a") },
  Faculty: { icon: "👩‍🏫", label: bcText("ui.f198296b7622c67b") },
  "Teaching Assistant": { icon: "📚", label: bcText("ui.9ce3d3ac5400a275") },
  Tutor: { icon: "🎯", label: bcText("ui.03335602fdce168e") },
  Staff: { icon: "🏢", label: bcText("ui.697f6b12ffe0ac85") },
};
// Role must come from verification_badges, never a self-reported profile role.
export default function VerificationBadge({
  role,
}: {
  role: string | null | undefined;
}) {
  const badge = role ? badges[role] : null;
  return (
    <Localized>
      {badge ? (
        <span
          className="verification-badge"
          title={bcText("ui.cd702392610f1bb3")}
        >
          <span aria-hidden="true">{badge.icon}</span>
          <span>{badge.label}</span>
        </span>
      ) : null}
    </Localized>
  );
}
export function PremiumBadge({ premium }: { premium: boolean }) {
  return (
    <Localized>
      {premium ? <span className="premium-badge">{bcText("ui.f5f9db905fda888d")}</span> : null}
    </Localized>
  );
}
