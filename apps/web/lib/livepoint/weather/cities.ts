import { PLOVDIV } from "../config";

export interface WeatherCity {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly altitude?: number;
  readonly timeZone: "Europe/Sofia";
}

export const DEFAULT_WEATHER_CITY: WeatherCity = { id: "plovdiv", ...PLOVDIV };

// City points from GeoNames (CC BY 4.0), rounded to the provider's four-decimal limit.
// https://www.geonames.org/advanced-search.html?country=BG&fclass=P
// Velingrad: https://www.geonames.org/725988/velingrad.html
// Karlovo: https://www.geonames.org/postal-codes/80570
// Bansko point: https://banskocity.bg/en/about-bansko/498-where-is-bansko
// Plovdiv retains its established forecast point. Sofia serves both Sofia regions.
const city = (id: string, name: string, lat: number, lon: number, altitude?: number): WeatherCity => ({
  id, name, lat, lon, timeZone: "Europe/Sofia", ...(altitude === undefined ? {} : { altitude }),
});

export const WEATHER_CITIES: readonly WeatherCity[] = [
  DEFAULT_WEATHER_CITY,
  city("asenovgrad", "Асеновград", 42.0167, 24.8667),
  city("bansko", "Банско", 41.8382, 23.4885),
  city("blagoevgrad", "Благоевград", 42.0146, 23.0980),
  city("burgas", "Бургас", 42.5065, 27.4689),
  city("varna", "Варна", 43.2191, 27.9102),
  city("veliko-tarnovo", "Велико Търново", 43.0812, 25.6290),
  city("velingrad", "Велинград", 42.0275, 23.9916, 750),
  city("vidin", "Видин", 43.9916, 22.8824),
  city("vratsa", "Враца", 43.2105, 23.5631),
  city("gabrovo", "Габрово", 42.8742, 25.3182),
  city("dobrich", "Добрич", 43.5649, 27.8314),
  city("karlovo", "Карлово", 42.6333, 24.8000),
  city("kardzhali", "Кърджали", 41.6450, 25.3658),
  city("kyustendil", "Кюстендил", 42.2831, 22.6922),
  city("lovech", "Ловеч", 43.1323, 24.7176),
  city("montana", "Монтана", 43.4129, 23.2217),
  city("pazardzhik", "Пазарджик", 42.1993, 24.3332),
  city("pernik", "Перник", 42.5967, 23.0332),
  city("pleven", "Плевен", 43.4179, 24.6167),
  city("razgrad", "Разград", 43.5333, 26.5185),
  city("ruse", "Русе", 43.8487, 25.9534),
  city("silistra", "Силистра", 44.1171, 27.2606),
  city("sliven", "Сливен", 42.6861, 26.3256),
  city("smolyan", "Смолян", 41.5744, 24.7120, 921),
  city("sofia", "София", 42.6975, 23.3241),
  city("stara-zagora", "Стара Загора", 42.4321, 25.6426),
  city("targovishte", "Търговище", 43.2512, 26.5722),
  city("haskovo", "Хасково", 41.9341, 25.5556),
  city("shumen", "Шумен", 43.2706, 26.9229),
  city("yambol", "Ямбол", 42.4824, 26.5001),
];

export function getWeatherCity(id: string | null | undefined): WeatherCity | undefined {
  return WEATHER_CITIES.find((entry) => entry.id === id);
}
