/** 内置宠物的显示文案；不改写宠物标识、自定义内容或持久化数据。 */
import { BUILTINS, type Pet } from "./model.ts";
import { normalizeLanguage } from "./ui-locales.ts";

export interface PetLocaleStore {
  getSnapshot(): { active: string };
  subscribe(listener: () => void): () => void;
}
type BuiltinId = (typeof BUILTINS)[number][0];

const zh: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["蒜狸", "陪你一起干活的蒜头小猫。"],
};

const ja: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["スアンリ", "一緒に作業してくれるニンニク猫。"],
};

const es: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["Suanli", "Un gato ajo que te acompaña mientras trabajas."],
};

const fr: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["Suanli", "Un chat-ail qui vous accompagne pendant le travail."],
};

const de: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["Suanli", "Eine Knoblauchkatze, die dich bei der Arbeit begleitet."],
};

const ru: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["Суаньли", "Чесночный котик, который составит компанию за работой."],
};

const pt: Record<BuiltinId, readonly [string, string]> = {
  suanli: ["Suanli", "Um gato-alho que faz companhia enquanto você trabalha."],
};

const petDictionaries = {
  zh,
  ja,
  es,
  fr,
  de,
  ru,
  pt,
} as const;

export function localizePet(pet: Pet, locale: string): Pet {
  if (pet.source !== "builtin") return pet;
  const entry = BUILTINS.find(([id]) => id === pet.id);
  if (!entry) return pet;
  const lang = normalizeLanguage(locale);
  if (lang === "en") {
    return { ...pet, name: entry[1], description: entry[2] };
  }
  const dict = petDictionaries[lang as keyof typeof petDictionaries];
  if (dict && dict[entry[0]]) {
    const [name, description] = dict[entry[0]];
    return { ...pet, name, description };
  }
  return { ...pet, name: entry[1], description: entry[2] };
}
