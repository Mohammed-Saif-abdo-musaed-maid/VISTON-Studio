import { useEditorStore } from "../../state/store";
import { t, LANGUAGES } from "../../i18n";

export function LanguageSelector() {
  const language = useEditorStore((s) => s.language);
  const setLanguage = useEditorStore((s) => s.setLanguage);

  const handleChange = (lang: string) => {
    setLanguage(lang as "en" | "ar");
  };

  return (
    <div className="vs-language-selector">
      <label>{t("language")}:</label>
      <select value={language} onChange={(e) => handleChange(e.target.value)}>
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(lang === "ar" ? "arabic" : "english")}
          </option>
        ))}
      </select>
    </div>
  );
}