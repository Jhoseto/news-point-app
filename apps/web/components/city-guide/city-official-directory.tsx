import "./city-official-directory.css";

const LINKS = {
  municipality: [
    { title: "Административни услуги", href: "https://www.plovdiv.bg/uslugi/administrative-services/" },
    { title: "Местни данъци и такси", href: "https://www.plovdiv.bg/item/taxes/" },
    { title: "Общински съвет", href: "https://plovdiv.bg/obs/" },
    { title: "Обществени обсъждания", href: "https://www.plovdiv.bg/announcements/pna/" },
    { title: "Търгове", href: "https://www.plovdiv.bg/announcements/auctions/" },
    { title: "Работа в общината", href: "https://www.plovdiv.bg/administration/work-plovdiv-municipality/obyavi/" },
    { title: "Контакти", href: "https://www.plovdiv.bg/fmenu/contacts/" },
  ],
  adopt: [
    { title: "Животни, които търсят дом", href: "https://dogshelter.plovdiv.bg/dogs-for-adoption" },
    { title: "Как се осиновява куче", href: "https://dogshelter.plovdiv.bg/" },
  ],
} as const;

export function CityOfficialDirectory({ category }: { category: "municipality" | "adopt" }) {
  return <article className="city-observed-group" id="nablyudavani-official-directory">
    <div className="city-observed-group-head"><div><h3>{category === "adopt" ? "Общински приют" : "Община Пловдив"}</h3><p className="city-panel-description">{category === "adopt" ? "Профили и стъпки за осиновяване от общинския приют." : "Услуги, документи и обществени обяви от официалния сайт."}</p></div></div>
    <nav className="city-official-directory" aria-label={category === "adopt" ? "Официални страници на приюта" : "Официални страници на общината"}>
      {LINKS[category].map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.title}</span><span className="city-official-destination">{category === "adopt" ? "Общински приют" : "Община Пловдив"}</span></a>)}
    </nav>
  </article>;
}
