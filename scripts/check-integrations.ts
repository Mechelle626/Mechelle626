import { serviceReadiness } from "../apps/web/lib/operations/readiness";
// Offline configuration diagnostic. Never sends mail, charges a card, generates
// translations, verifies a user, or prints credential values.
console.log(JSON.stringify(await serviceReadiness(), null, 2));
