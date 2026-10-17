'use client';
import { message as bcText } from "../lib/i18n/source";

import {Localized} from '../components/localization';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <Localized><main className="dashboard-page"><h1>{bcText("ui.ab827e3fe17da220")}</h1><p>{bcText("ui.0467eef894d1666d")}</p><button onClick={reset}>{bcText("ui.d8b8392e2c542950")}</button></main></Localized>;}
