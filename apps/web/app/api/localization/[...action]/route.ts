import { NextRequest } from 'next/server';
import { localizationHandler } from '../../../../lib/i18n/handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:NextRequest,context:{params:Promise<{action:string[]}>}){return localizationHandler(request,(await context.params).action);}
export { handle as GET, handle as POST };
