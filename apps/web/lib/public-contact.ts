/** Public editorial details supplied by Koce. Shared by footer and information pages. */
export const PUBLIC_CONTACT = {
  country: "България",
  city: "гр. Пловдив",
  street: "ул. Академик Петър Динеков № 15",
  address: "България, гр. Пловдив, ул. Академик Петър Динеков № 15",
  phone: "0893544644",
  phoneHref: "tel:+359893544644",
  email: "newspointbg@gmail.com",
  emailHref: "mailto:newspointbg@gmail.com",
} as const;

export const CONTACT_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PUBLIC_CONTACT.address)}`;
export const ADVERTISING_MAIL_URL = `${PUBLIC_CONTACT.emailHref}?subject=${encodeURIComponent("Запитване за реклама — NewsPoint.bg")}`;
export const PUBLIC_INFO_PAGES = {
  contacts: { path: "/contacts/", title: "Контакти", description: "Свържете се с редакцията на NewsPoint.bg — адрес, телефон и имейл." },
  advertising: { path: "/advertising/", title: "Реклама", description: "Контакт за рекламни запитвания към NewsPoint.bg." },
} as const;
