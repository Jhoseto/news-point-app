import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-24 text-center">
      <span className="np-gradient-text text-7xl font-extrabold">404</span>
      <h1 className="text-2xl font-extrabold text-ink">Страницата не е намерена</h1>
      <p className="text-body">Адресът може да е сгрешен или статията вече да не е публична.</p>
      <ButtonLink href="/">Към началото</ButtonLink>
    </div>
  );
}
