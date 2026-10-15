import type { Locale } from "./i18n";

export type BodyView = "front" | "back";
export type BodyGender = "male" | "female";
export type BodyRegion = { id: string; x: number; y: number; w: number; h: number; path: string; labels: Record<Locale, string> };

const labels = (en: string, ru: string, es: string, pt: string): Record<Locale, string> => ({en, ru, es, pt});

export const frontRegions: BodyRegion[] = [
  {id:"left-shoulder",x:99,y:116,w:43,h:45,path:"M92 99 Q111 80 139 102 L132 143 L103 149 Z",labels:labels("Right shoulder","Правое плечо","Hombro derecho","Ombro direito")},
  {id:"right-shoulder",x:261,y:116,w:43,h:45,path:"M268 99 Q249 80 221 102 L228 143 L257 149 Z",labels:labels("Left shoulder","Левое плечо","Hombro izquierdo","Ombro esquerdo")},
  {id:"left-upper-arm",x:76,y:184,w:40,h:91,path:"M91 125 L122 145 L107 239 L70 234 Z",labels:labels("Right upper arm","Правое плечо, наружная сторона","Brazo derecho","Braço direito")},
  {id:"right-upper-arm",x:284,y:184,w:40,h:91,path:"M269 125 L238 145 L253 239 L290 234 Z",labels:labels("Left upper arm","Левое плечо, наружная сторона","Brazo izquierdo","Braço esquerdo")},
  {id:"left-forearm",x:62,y:297,w:35,h:108,path:"M69 235 L105 240 L82 357 L42 354 Z",labels:labels("Right forearm","Правое предплечье","Antebrazo derecho","Antebraço direito")},
  {id:"right-forearm",x:298,y:297,w:35,h:108,path:"M291 235 L255 240 L278 357 L318 354 Z",labels:labels("Left forearm","Левое предплечье","Antebrazo izquierdo","Antebraço esquerdo")},
  {id:"left-wrist",x:48,y:371,w:26,h:32,path:"M43 351 L84 355 L77 389 L45 386 Z",labels:labels("Right wrist / hand","Правое запястье и кисть","Muñeca y mano derecha","Punho e mão direita")},
  {id:"right-wrist",x:312,y:371,w:26,h:32,path:"M317 351 L276 355 L283 389 L315 386 Z",labels:labels("Left wrist / hand","Левое запястье и кисть","Muñeca y mano izquierda","Punho e mão esquerda")},
  {id:"chest",x:180,y:155,w:118,h:78,path:"M133 109 Q180 93 227 109 L239 191 Q180 208 121 191 Z",labels:labels("Chest","Грудь","Pecho","Peito")},
  {id:"left-ribs",x:129,y:250,w:42,h:80,path:"M121 194 L164 202 L164 299 L133 309 Z",labels:labels("Right ribs / side","Правые рёбра и бок","Costillas derechas","Costelas direitas")},
  {id:"right-ribs",x:231,y:250,w:42,h:80,path:"M239 194 L196 202 L196 299 L227 309 Z",labels:labels("Left ribs / side","Левые рёбра и бок","Costillas izquierdas","Costelas esquerdas")},
  {id:"abdomen",x:180,y:280,w:70,h:86,path:"M165 202 L195 202 L225 305 L216 351 L144 351 L135 305 Z",labels:labels("Abdomen","Живот","Abdomen","Abdômen")},
  {id:"left-thigh",x:147,y:459,w:49,h:112,path:"M126 379 L178 381 L170 542 L122 540 Z",labels:labels("Right thigh","Правое бедро","Muslo derecho","Coxa direita")},
  {id:"right-thigh",x:213,y:459,w:49,h:112,path:"M234 379 L182 381 L190 542 L238 540 Z",labels:labels("Left thigh","Левое бедро","Muslo izquierdo","Coxa esquerda")},
  {id:"left-knee",x:144,y:555,w:39,h:35,path:"M122 538 L169 540 L166 572 L123 574 Z",labels:labels("Right knee","Правое колено","Rodilla derecha","Joelho direito")},
  {id:"right-knee",x:216,y:555,w:39,h:35,path:"M238 538 L191 540 L194 572 L237 574 Z",labels:labels("Left knee","Левое колено","Rodilla izquierda","Joelho esquerdo")},
  {id:"left-calf",x:140,y:634,w:43,h:86,path:"M123 575 L166 574 L159 696 L131 696 Z",labels:labels("Right shin / calf","Правая голень","Pantorrilla derecha","Panturrilha direita")},
  {id:"right-calf",x:220,y:634,w:43,h:86,path:"M237 575 L194 574 L201 696 L229 696 Z",labels:labels("Left shin / calf","Левая голень","Pantorrilla izquierda","Panturrilha esquerda")},
];

export const backRegions: BodyRegion[] = frontRegions.map(region => {
  const replacements: Record<string, [string,string,string,string]> = {
    chest:["Upper back","Верх спины","Espalda superior","Costas superiores"],
    abdomen:["Lower back / spine","Поясница и позвоночник","Espalda baja y columna","Lombar e coluna"],
    "left-ribs":["Left side / back","Левый бок спины","Lado izquierdo de espalda","Lado esquerdo das costas"],
    "right-ribs":["Right side / back","Правый бок спины","Lado derecho de espalda","Lado direito das costas"],
    "left-thigh":["Back of left thigh","Задняя сторона левого бедра","Parte posterior del muslo izquierdo","Parte posterior da coxa esquerda"],
    "right-thigh":["Back of right thigh","Задняя сторона правого бедра","Parte posterior del muslo derecho","Parte posterior da coxa direita"],
    "left-calf":["Left calf","Левая икра","Pantorrilla izquierda","Panturrilha esquerda"],
    "right-calf":["Right calf","Правая икра","Pantorrilla derecha","Panturrilha direita"],
  };
  const alternate = replacements[region.id];
  const opposite = region.id.startsWith("left-") ? region.id.replace("left-", "right-") : region.id.startsWith("right-") ? region.id.replace("right-", "left-") : null;
  return {...region, labels: alternate ? labels(...alternate) : (opposite ? frontRegions.find(item => item.id === opposite)?.labels || region.labels : region.labels)};
});

export const regionsFor = (view: BodyView) => view === "front" ? frontRegions : backRegions;
