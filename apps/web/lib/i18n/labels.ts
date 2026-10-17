import english from '../../messages/en.json' with {type:'json'};
// Backend wire values stay unchanged. Display labels are catalog entries.
export function statusLabel(code:string|null|undefined){return (english as Record<string,string>)['status.'+code] ?? (english as Record<string,string>)['status.unknown'];}
