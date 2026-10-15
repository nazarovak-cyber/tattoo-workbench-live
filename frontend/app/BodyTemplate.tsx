"use client";

import { BodyGender, BodyView, regionsFor } from "@/lib/body-regions";
import type { Locale } from "@/lib/i18n";

type Props = { gender: BodyGender; view: BodyView; selected: string; locale: Locale; onSelect?: (id: string) => void };

export default function BodyTemplate({gender, view, selected, locale, onSelect}: Props) {
  const female = gender === "female";
  const shoulder = female ? 111 : 97;
  const hip = female ? 119 : 130;
  return <svg className="body-template" viewBox="0 0 360 720" role="img" aria-label={`${gender} ${view} body placement map`}>
    <defs>
      <linearGradient id="skin" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#9a7569"/><stop offset=".48" stopColor="#d6ad9b"/><stop offset="1" stopColor="#aa8273"/></linearGradient>
      <linearGradient id="skinLeg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#8e6b61"/><stop offset=".5" stopColor="#cda18e"/><stop offset="1" stopColor="#9f7869"/></linearGradient>
      <linearGradient id="bodySuit" x1="0" x2="1"><stop offset="0" stopColor="#23253b"/><stop offset=".5" stopColor="#35364d"/><stop offset="1" stopColor="#22243a"/></linearGradient>
    </defs>
    <ellipse cx="180" cy="50" rx="28" ry="35" fill="url(#skin)" stroke="#81645d" strokeWidth="2"/>
    <path d="M164 72 L196 72 L201 105 L159 105 Z" fill="url(#skin)"/>
    <path d="M110 112 Q92 114 83 155 L61 241 L48 346 Q43 362 50 376 L70 380 Q80 362 81 350 L108 248 L133 145 Z" fill="url(#skin)" stroke="#765d56" strokeWidth="2"/>
    <path d="M250 112 Q268 114 277 155 L299 241 L312 346 Q317 362 310 376 L290 380 Q280 362 279 350 L252 248 L227 145 Z" fill="url(#skin)" stroke="#765d56" strokeWidth="2"/>
    <path d={`M${shoulder} 107 Q143 87 159 91 L201 91 Q217 87 ${360-shoulder} 107 Q246 142 239 205 L228 304 Q241 348 ${360-hip} 379 L${hip} 379 Q119 348 132 304 L121 205 Q114 142 ${shoulder} 107 Z`} fill="url(#skin)" stroke="#765d56" strokeWidth="2"/>
    <path d="M132 368 L180 374 L174 551 L162 682 Q159 706 143 707 L125 700 L120 548 Z" fill="url(#skinLeg)" stroke="#765d56" strokeWidth="2"/>
    <path d="M228 368 L180 374 L186 551 L198 682 Q201 706 217 707 L235 700 L240 548 Z" fill="url(#skinLeg)" stroke="#765d56" strokeWidth="2"/>
    <path d="M123 361 Q180 378 237 361 L238 408 Q210 424 181 411 Q150 424 122 408 Z" fill="url(#bodySuit)" stroke="#68697e" strokeWidth="2"/>
    {female && <path d="M130 139 Q180 148 230 139" fill="none" stroke="#9d786d" strokeWidth="1.5" opacity=".35"/>}
    {view === "back" ? <path d="M180 105 Q175 175 180 236 Q186 300 180 360 M143 147 Q158 174 171 168 M217 147 Q202 174 189 168" fill="none" stroke="#866961" strokeWidth="2" opacity=".55"/> : <path d="M180 195 L180 337 M139 205 Q180 218 221 205" fill="none" stroke="#866961" strokeWidth="2" opacity=".4"/>}
    <path d="M52 365 Q39 377 42 396 L49 414 Q57 422 68 412 L76 382 Z M308 365 Q321 377 318 396 L311 414 Q303 422 292 412 L284 382 Z" fill="url(#skin)" stroke="#765d56" strokeWidth="2"/>
    <path d="M124 697 L159 697 L161 712 L118 712 Z M201 697 L236 697 L242 712 L199 712 Z" fill="url(#bodySuit)"/>
    {regionsFor(view).map(region => <path key={region.id} d={region.path} className={`body-hit ${selected === region.id ? "selected" : ""}`} role="button" tabIndex={onSelect ? 0 : -1} aria-label={region.labels[locale]} onClick={() => onSelect?.(region.id)} onKeyDown={e => {if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(region.id); }}}/>)}
  </svg>;
}
