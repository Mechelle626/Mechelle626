"use client";
import { message as bcText } from "../lib/i18n/source";

export async function api<T=any>(path:string,body?:unknown):Promise<T> {
  const response=await fetch("/api/platform/"+path,body===undefined?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const value=await response.json(); if(!response.ok)throw new Error(value.error??bcText("ui.db4fb44737e74f1b"));return value;
}
