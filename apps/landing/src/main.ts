import "./styles.css";

type Locale = "ru" | "kk";

interface Copy {
  readonly nav: readonly [string, string][];
  readonly eyebrow: string;
  readonly headline: string;
  readonly headlineAccent: string;
  readonly description: string;
  readonly primaryCta: string;
  readonly secondaryCta: string;
  readonly availability: string;
  readonly heroNote: string;
  readonly benefitsTitle: string;
  readonly benefits: readonly {
    readonly number: string;
    readonly title: string;
    readonly text: string;
  }[];
  readonly assortmentEyebrow: string;
  readonly assortmentTitle: string;
  readonly assortmentText: string;
  readonly categories: readonly string[];
  readonly appEyebrow: string;
  readonly appTitle: string;
  readonly appText: string;
  readonly appPoints: readonly string[];
  readonly openApp: string;
  readonly appUnavailable: string;
  readonly howEyebrow: string;
  readonly howTitle: string;
  readonly steps: readonly { readonly title: string; readonly text: string }[];
  readonly coverageEyebrow: string;
  readonly coverageTitle: string;
  readonly coverageText: string;
  readonly coverageItems: readonly string[];
  readonly faqTitle: string;
  readonly faq: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
  readonly finalTitle: string;
  readonly finalText: string;
  readonly footer: string;
}

const content: Record<Locale, Copy> = {
  ru: {
    nav: [
      ["#how", "Как это работает"],
      ["#assortment", "Ассортимент"],
      ["#delivery", "Доставка"],
    ],
    eyebrow: "Altyn Orda -> ваш стол",
    headline: "Свежие продукты",
    headlineAccent: "с доставкой по Алматы",
    description:
      "Выбирайте овощи, фрукты, зелень и ягоды в приложении. Мы соберём заказ, покажем итог и привезём его к вашей двери.",
    primaryCta: "Смотреть ассортимент",
    secondaryCta: "Как это работает",
    availability: "Работаем в Алматы и ближайших посёлках",
    heroNote:
      "Без замен: если товар не проходит отбор, мы отменим его и пересчитаем заказ.",
    benefitsTitle: "Продукты, которым можно доверять",
    benefits: [
      {
        number: "01",
        title: "Отбираем вручную",
        text: "Сборщик проверяет каждый товар перед тем, как положить его в пакет.",
      },
      {
        number: "02",
        title: "Честная сумма",
        text: "Сначала показываем ориентир, затем фиксируем итог после сборки.",
      },
      {
        number: "03",
        title: "Статус в приложении",
        text: "Отслеживайте заказ от сборки до момента, когда курьер будет у двери.",
      },
    ],
    assortmentEyebrow: "То, что нужно каждый день",
    assortmentTitle: "Сезонная свежесть без долгих поисков",
    assortmentText:
      "Собрали основу для домашней кухни, полезных перекусов и тёплого стола.",
    categories: ["Овощи", "Фрукты", "Зелень", "Ягоды", "Сухофрукты", "Орехи"],
    appEyebrow: "Всё под рукой",
    appTitle: "Заказывайте в приложении",
    appText:
      "Собирайте корзину, сохраняйте адрес, выбирайте способ оплаты и получайте обновления по заказу.",
    appPoints: ["Быстрый поиск", "Корзина и адреса", "Статус заказа"],
    openApp: "Открыть приложение",
    appUnavailable:
      "Ссылка на приложение появится здесь перед запуском. Пока можно познакомиться с ассортиментом ниже.",
    howEyebrow: "Просто и прозрачно",
    howTitle: "От выбора до двери",
    steps: [
      {
        title: "Выберите продукты",
        text: "Добавьте нужное в корзину и укажите удобный адрес доставки.",
      },
      {
        title: "Мы соберём заказ",
        text: "Проверим качество, отменим неподходящие позиции и пересчитаем итог.",
      },
      {
        title: "Встретьте курьера",
        text: "Следите за статусом в приложении и получите свежие продукты у двери.",
      },
    ],
    coverageEyebrow: "Рядом с вами",
    coverageTitle: "Доставляем по Алматы",
    coverageText:
      "Начинаем с Алматы и ближайших населённых пунктов. Точную возможность доставки покажем при оформлении заказа.",
    coverageItems: ["Алматы", "Пригород Алматы", "Бережная доставка"],
    faqTitle: "Частые вопросы",
    faq: [
      {
        question: "Что будет, если товара нет в наличии?",
        answer:
          "Мы не заменяем товары без вашего согласия. Неподходящую позицию отменим и пересчитаем итог заказа.",
      },
      {
        question: "Когда списывается оплата?",
        answer:
          "При оформлении мы авторизуем ориентировочную сумму. Финальная сумма фиксируется после сборки заказа.",
      },
      {
        question: "Можно ли отследить заказ?",
        answer:
          "Да. В приложении вы увидите этапы сборки и доставки, а также получите обновления по заказу.",
      },
    ],
    finalTitle: "Свежесть начинается с хорошего выбора",
    finalText:
      "Выбирайте продукты спокойно - о качестве и доставке позаботится Altyn Market.",
    footer: "Altyn Market. Свежесть рядом.",
  },
  kk: {
    nav: [
      ["#how", "Қалай жұмыс істейді"],
      ["#assortment", "Ассортимент"],
      ["#delivery", "Жеткізу"],
    ],
    eyebrow: "Altyn Orda -> сіздің дастарханыңыз",
    headline: "Балғын өнімдер",
    headlineAccent: "Алматы бойынша жеткізумен",
    description:
      "Қосымшадан көкөніс, жеміс, көк шөп пен жидекті таңдаңыз. Біз тапсырысты жинап, соңғы соманы көрсетіп, есігіңізге дейін жеткіземіз.",
    primaryCta: "Ассортиментті көру",
    secondaryCta: "Қалай жұмыс істейді",
    availability: "Алматыда және жақын елді мекендерде жұмыс істейміз",
    heroNote:
      "Алмастырусыз: өнім сапа тексерісінен өтпесе, оны алып тастап, тапсырысты қайта есептейміз.",
    benefitsTitle: "Сенім артуға болатын өнімдер",
    benefits: [
      {
        number: "01",
        title: "Қолмен іріктейміз",
        text: "Жинаушы өнімді сөмкеге салмас бұрын әр заттың сапасын тексереді.",
      },
      {
        number: "02",
        title: "Адал сома",
        text: "Алдымен болжамды соманы көрсетеміз, кейін жинақтау аяқталған соң қорытындыны бекітеміз.",
      },
      {
        number: "03",
        title: "Қосымшадағы мәртебе",
        text: "Тапсырысты жинақтаудан бастап курьер есігіңізге келгенге дейін бақылаңыз.",
      },
    ],
    assortmentEyebrow: "Күн сайын керек өнімдер",
    assortmentTitle: "Ұзақ іздеусіз маусымдық балғындық",
    assortmentText:
      "Үй тағамына, пайдалы тіскебасарға және жайлы дастарханға қажетті өнімдерді жинадық.",
    categories: [
      "Көкөністер",
      "Жемістер",
      "Көк шөп",
      "Жидектер",
      "Кептірілген жемістер",
      "Жаңғақтар",
    ],
    appEyebrow: "Барлығы қолыңызда",
    appTitle: "Қосымша арқылы тапсырыс беріңіз",
    appText:
      "Себет жинаңыз, мекенжайды сақтаңыз, төлем тәсілін таңдаңыз және тапсырыс жаңартуларын алыңыз.",
    appPoints: ["Жылдам іздеу", "Себет және мекенжайлар", "Тапсырыс мәртебесі"],
    openApp: "Қосымшаны ашу",
    appUnavailable:
      "Қосымша сілтемесі іске қосылар алдында осында шығады. Әзірге төмендегі ассортиментпен таныса аласыз.",
    howEyebrow: "Қарапайым әрі ашық",
    howTitle: "Таңдаудан есікке дейін",
    steps: [
      {
        title: "Өнімдерді таңдаңыз",
        text: "Қажеттісін себетке қосып, ыңғайлы жеткізу мекенжайын көрсетіңіз.",
      },
      {
        title: "Біз тапсырысты жинаймыз",
        text: "Сапасын тексереміз, жарамсыз позицияларды алып тастап, қорытындыны қайта есептейміз.",
      },
      {
        title: "Курьерді қарсы алыңыз",
        text: "Қосымшадағы мәртебені бақылап, балғын өнімді есігіңізден алыңыз.",
      },
    ],
    coverageEyebrow: "Сізге жақын",
    coverageTitle: "Алматы бойынша жеткіземіз",
    coverageText:
      "Алматыдан және жақын елді мекендерден бастаймыз. Жеткізу мүмкіндігін тапсырысты рәсімдегенде нақты көрсетеміз.",
    coverageItems: ["Алматы", "Алматы маңы", "Ұқыпты жеткізу"],
    faqTitle: "Жиі қойылатын сұрақтар",
    faq: [
      {
        question: "Өнім қоймада болмаса не болады?",
        answer:
          "Сіздің келісіміңізсіз тауарды алмастырмаймыз. Жарамсыз позицияны алып тастап, тапсырыс сомасын қайта есептейміз.",
      },
      {
        question: "Төлем қашан алынады?",
        answer:
          "Рәсімдеу кезінде болжамды соманы авторизациялаймыз. Соңғы сома тапсырыс жинақталғаннан кейін бекітіледі.",
      },
      {
        question: "Тапсырысты бақылауға бола ма?",
        answer:
          "Иә. Қосымшада жинақтау мен жеткізу кезеңдерін көріп, тапсырыс туралы жаңартулар аласыз.",
      },
    ],
    finalTitle: "Балғындық жақсы таңдаудан басталады",
    finalText:
      "Өнімді алаңдамай таңдаңыз - сапа мен жеткізуді Altyn Market ойлайды.",
    footer: "Altyn Market. Балғындық жаныңызда.",
  },
};

const app = (() => {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("Landing root element is missing.");
  }
  return root;
})();

const configuredCustomerAppUrl = import.meta.env.VITE_CUSTOMER_APP_URL?.trim();
let locale: Locale = "ru";

function render(): void {
  const copy = content[locale];
  document.documentElement.lang = locale;
  document.title =
    locale === "ru"
      ? "Altyn Market - свежесть рядом"
      : "Altyn Market - балғындық жаныңызда";

  app.innerHTML = `
    <main>
      <section class="hero" id="top">
        <nav class="nav shell" aria-label="Main navigation">
          <a class="brand" href="#top" aria-label="Altyn Market">
            <span class="brand-mark">a</span><span>altyn<br />market</span>
          </a>
          <div class="nav-links">
            ${copy.nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}
          </div>
          <div class="locale-toggle" aria-label="Language">
            <button class="${locale === "ru" ? "active" : ""}" data-locale="ru">RU</button>
            <button class="${locale === "kk" ? "active" : ""}" data-locale="kk">ҚАЗ</button>
          </div>
        </nav>
        <div class="hero-content shell">
          <div class="hero-copy">
            <p class="eyebrow"><span></span>${copy.eyebrow}</p>
            <h1>${copy.headline} <em>${copy.headlineAccent}</em></h1>
            <p class="hero-description">${copy.description}</p>
            <div class="hero-actions">
              <a class="button button-primary" href="#assortment">${copy.primaryCta}<span aria-hidden="true">-></span></a>
              <a class="text-link" href="#how">${copy.secondaryCta}<span aria-hidden="true">↓</span></a>
            </div>
            <p class="availability"><span class="pulse"></span>${copy.availability}</p>
          </div>
          <div class="hero-art" aria-label="Fresh fruit and vegetables illustration">
            <div class="sun"></div>
            <div class="leaf leaf-one"></div><div class="leaf leaf-two"></div>
            <div class="produce tomato"><i></i></div>
            <div class="produce pear"><i></i></div>
            <div class="produce orange"><i></i></div>
            <div class="produce pepper"><i></i></div>
            <div class="basket"><div class="basket-handle"></div><span></span><span></span><span></span></div>
            <p class="art-note">${copy.heroNote}</p>
          </div>
        </div>
        <div class="hero-footer shell"><span>ALMATY</span><span>FRESH FROM THE MARKET</span><span>2026</span></div>
      </section>

      <section class="benefits shell">
        <h2>${copy.benefitsTitle}</h2>
        <div class="benefit-grid">
          ${copy.benefits
            .map(
              (benefit) => `
            <article class="benefit-card">
              <span>${benefit.number}</span><h3>${benefit.title}</h3><p>${benefit.text}</p>
            </article>
          `,
            )
            .join("")}
        </div>
      </section>

      <section class="assortment" id="assortment">
        <div class="shell assortment-layout">
          <div>
            <p class="eyebrow dark"><span></span>${copy.assortmentEyebrow}</p>
            <h2>${copy.assortmentTitle}</h2>
          </div>
          <p class="assortment-text">${copy.assortmentText}</p>
        </div>
        <div class="category-strip" aria-label="Product categories">
          ${copy.categories.map((category, index) => `<div class="category-card category-${index + 1}"><span>${category}</span><b>${String(index + 1).padStart(2, "0")}</b></div>`).join("")}
        </div>
      </section>

      <section class="app-section shell" id="customer-app">
        <div class="phone-wrap" aria-hidden="true">
          <div class="phone"><div class="phone-notch"></div><div class="phone-screen"><small>altyn market</small><strong>Доброе утро!</strong><div class="screen-search">⌕ &nbsp; Найти продукты</div><div class="screen-products"><span>🍅</span><span>🍐</span><span>🥬</span><span>🍓</span></div><div class="screen-cart">Корзина <b>3</b></div></div></div>
          <div class="sticker">fresh<br />every day</div>
        </div>
        <div class="app-copy">
          <p class="eyebrow dark"><span></span>${copy.appEyebrow}</p>
          <h2>${copy.appTitle}</h2>
          <p>${copy.appText}</p>
          <ul>${copy.appPoints.map((point) => `<li><span>✓</span>${point}</li>`).join("")}</ul>
          <button class="button button-primary app-button" data-open-app>${copy.openApp}<span aria-hidden="true">-></span></button>
          <p class="app-message" role="status" aria-live="polite"></p>
        </div>
      </section>

      <section class="how" id="how">
        <div class="shell">
          <p class="eyebrow"><span></span>${copy.howEyebrow}</p>
          <h2>${copy.howTitle}</h2>
          <div class="steps">
            ${copy.steps.map((step, index) => `<article><span>0${index + 1}</span><div><h3>${step.title}</h3><p>${step.text}</p></div></article>`).join("")}
          </div>
        </div>
      </section>

      <section class="delivery shell" id="delivery">
        <div class="delivery-map" aria-hidden="true"><span class="map-line line-one"></span><span class="map-line line-two"></span><span class="map-line line-three"></span><span class="pin pin-one"></span><span class="pin pin-two"></span><span class="pin pin-three"></span><b>ALMATY</b></div>
        <div class="delivery-copy">
          <p class="eyebrow dark"><span></span>${copy.coverageEyebrow}</p>
          <h2>${copy.coverageTitle}</h2>
          <p>${copy.coverageText}</p>
          <div class="coverage-list">${copy.coverageItems.map((item) => `<span>${item}</span>`).join("")}</div>
        </div>
      </section>

      <section class="faq shell">
        <h2>${copy.faqTitle}</h2>
        <div class="faq-list">
          ${copy.faq.map((item, index) => `<details ${index === 0 ? "open" : ""}><summary>${item.question}<span>+</span></summary><p>${item.answer}</p></details>`).join("")}
        </div>
      </section>

      <section class="final-cta">
        <div class="shell final-layout"><div><p class="eyebrow"><span></span>ALTYN MARKET</p><h2>${copy.finalTitle}</h2><p>${copy.finalText}</p></div><a class="button button-light" href="#customer-app">${copy.openApp}<span aria-hidden="true">-></span></a></div>
      </section>
    </main>
    <footer class="shell"><a class="brand" href="#top"><span class="brand-mark">a</span><span>altyn<br />market</span></a><p>${copy.footer}</p><a href="#top">↑</a></footer>
  `;

  for (const button of Array.from(
    app.querySelectorAll<HTMLButtonElement>("[data-locale]"),
  )) {
    button.addEventListener("click", () => {
      locale = button.dataset.locale === "kk" ? "kk" : "ru";
      render();
    });
  }

  app
    .querySelector<HTMLButtonElement>("[data-open-app]")
    ?.addEventListener("click", () => {
      if (configuredCustomerAppUrl) {
        window.location.assign(configuredCustomerAppUrl);
        return;
      }

      const message = app.querySelector<HTMLParagraphElement>(".app-message");
      if (message) {
        message.textContent = content[locale].appUnavailable;
      }
    });
}

render();
