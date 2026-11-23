# Builds the bilingual guide page. T(en, hi) -> paired spans; CSS shows one language.
import html as H
def T(en, hi): return f'<span class="l-en">{en}</span><span class="l-hi" lang="hi">{hi}</span>'
def P(en, hi): return f'<p>{T(en, hi)}</p>'
def pin(n): return f'<b class="pin" aria-hidden="true">{n}</b>'
def btn(en, hi, kind="", n=None, icon=""): return f'<span class="btn {kind}">{icon}{T(en, hi)}</span>{pin(n) if n else ""}'
def chip(en, hi, tone="neutral"): return f'<span class="chip {tone}">{T(en, hi)}</span>'
def field(en, hi, val="", n=None, big=False): return f'<div class="fld"><div class="lbl">{T(en, hi)}{pin(n) if n else ""}</div><div class="inp{" big" if big else ""}">{val}</div></div>'
def steps(items):  # numbered callout explanations
    return '<ol class="callouts">' + "".join(f'<li><b class="pin">{i+1}</b><span>{T(en, hi)}</span></li>' for i, (en, hi) in enumerate(items)) + '</ol>'
def section(id_, num, en, hi, intro, body):
    n = f'<span class="secnum">{num}</span>' if num else ""
    return f'<section id="{id_}" class="sec"><h2>{n}{T(en, hi)}</h2>{intro}{body}</section>'
def pair(text, wire): return f'<div class="pair"><div class="txt">{text}</div><div class="wire">{wire}</div></div>'
def phone(inner, title_en="", title_hi=""): 
    return f'<figure class="wf phone"><div class="wf-top"><span class="logo">₹</span><span>PF ESIC Desk</span><span class="sp"></span><span class="mini">⟷ हिंदी</span></div><div class="wf-body">{inner}</div>{tabs()}</figure>'
def tabs(active=0):
    names = [("This month","इस महीने"),("Today","आज"),("Clients","ग्राहक"),("Reports","रिपोर्ट"),("More","और")]
    return '<div class="tabs">' + "".join(f'<span class="{"on" if i==active else ""}">▢<br>{T(a,b)}</span>' for i,(a,b) in enumerate(names)) + '</div>'
def sheet(title_en, title_hi, sub, inner, foot=""):
    return f'<figure class="wf phone sheetwf"><div class="dim"></div><div class="sheet"><div class="grab"></div><div class="sh-title">{T(title_en, title_hi)}</div><div class="sh-sub">{sub}</div>{inner}{f"<div class=foot>{foot}</div>" if foot else ""}</div></figure>'
def desk(inner):
    nav = [("This month","इस महीने"),("Today","आज"),("Fast entry","तेज़ एंट्री"),("Clients","ग्राहक"),("Reports","रिपोर्ट"),("Settings","सेटिंग"),("How it works","कैसे चलाएँ")]
    side = "".join(f'<div class="nv{" on" if i==0 else ""}">▢ {T(a,b)}</div>' for i,(a,b) in enumerate(nav))
    return f'<figure class="wf desk"><div class="side"><div class="brand"><span class="logo">₹</span> PF ESIC Desk</div><div class="search">⌕ {T("Search","खोजें")} <kbd>Ctrl K</kbd></div>{side}<div class="sp"></div><div class="nv">☾ &nbsp;⟷ हिं &nbsp;⇥ {T("Sign out","साइन आउट")}</div></div><div class="main">{inner}</div></figure>'
line = lambda w=70: f'<i class="ln" style="width:{w}%"></i>'

S = []

# ── 0. Before you start
S.append(section("start", "", "Before you start", "शुरू करने से पहले",
  P("PF ESIC Desk keeps every client's PF, ESIC, fees, payments, receipts and challans in one place, on the phone and the computer. Both partners see the same figures at the same time.",
    "PF ESIC डेस्क में हर ग्राहक का PF, ESIC, फीस, भुगतान, रसीद और चालान एक जगह रहता है, फ़ोन और कंप्यूटर दोनों पर। दोनों पार्टनर एक ही समय पर एक जैसे आँकड़े देखते हैं।"),
  pair(
    steps([("Open the website and type the email and password Alok or Rajeev gave you.", "वेबसाइट खोलें और आलोक या राजीव का दिया ईमेल और पासवर्ड लिखें।"),
           ("Press Sign in. You stay signed in on that phone or computer.", "‘साइन इन’ दबाएँ। उस फ़ोन या कंप्यूटर पर आप साइन इन ही रहेंगे।"),
           ("The language button at the top switches every screen between हिंदी and English. Each phone remembers its own choice.", "ऊपर का भाषा बटन हर स्क्रीन को हिंदी या English में बदलता है। हर फ़ोन अपनी पसंद याद रखता है।"),
           ("On the phone, use “Add to Home screen” in the browser menu. It then opens like an app.", "फ़ोन पर ब्राउज़र मेनू में ‘Add to Home screen’ चुनें। फिर यह ऐप की तरह खुलेगा।")])
    + P("Receipts and WhatsApp messages always go in the client's own language, whatever the screen language is.", "स्क्रीन की भाषा चाहे जो हो, रसीद और व्हाट्सऐप संदेश हमेशा ग्राहक की अपनी भाषा में जाते हैं।"),
    f'''<figure class="wf phone"><div class="wf-top"><span class="sp"></span><span class="mini">⟷ हिंदी</span>{pin(3)}</div><div class="wf-body center">
      <div class="brandbig"><span class="logo">₹</span> PF ESIC Desk</div>
      <div class="card">
        <div class="h">{T("Welcome back","फिर से स्वागत है")}</div>{line(80)}
        {field("Email","ईमेल","", 1)}{field("Password","पासवर्ड","••••••••")}
        <div class="btn pri block">{T("Sign in →","साइन इन →")}</div>{pin(2)}
      </div></div></figure>''')))

# ── 1. Find your way
S.append(section("map", "", "Find your way around", "स्क्रीन पहचानें",
  P("On the computer the menu is on the left. On the phone it is at the bottom; less-used screens are under More.", "कंप्यूटर पर मेनू बाईं ओर है। फ़ोन पर नीचे है; कम काम आने वाली स्क्रीन ‘और’ में हैं।"),
  '<div class="maptable">' + "".join(f'<div class="mrow"><b>{T(a,b)}</b><span>{T(c,d)}</span></div>' for a,b,c,d in [
    ("This month","इस महीने","Every client for one wage month: who owes, who is done, and the next step for each.","एक वेतन माह के सभी ग्राहक: किस पर बकाया है, कौन पूरा है, और हर एक का अगला काम।"),
    ("Today","आज","Your to-do list for today, most urgent first, one client at a time.","आज के काम की सूची, सबसे ज़रूरी पहले, एक बार में एक ग्राहक।"),
    ("Fast entry","तेज़ एंट्री","Type PF and ESIC for all clients in one list.","सभी ग्राहकों का PF और ESIC एक सूची में भरें।"),
    ("Clients","ग्राहक","Every client, their phone, codes, months, payments and statement.","हर ग्राहक, उनका फ़ोन, कोड, महीने, भुगतान और खाता विवरण।"),
    ("Reports","रिपोर्ट","Money check, partner settlement, receipt list and Excel backup.","पैसों का मिलान, पार्टनर हिसाब, रसीदों की सूची और एक्सेल बैकअप।"),
    ("Settings","सेटिंग","Business name, phone, due day, WhatsApp message wording, partner split.","कारोबार का नाम, फ़ोन, आख़िरी तारीख़, व्हाट्सऐप संदेश के शब्द, पार्टनर बँटवारा।"),
    ("How it works","कैसे चलाएँ","The five monthly steps, inside the app.","ऐप के अंदर, महीने के पाँच कदम।"),
  ]) + '</div>'))

# ── 2. Five steps overview
five = [("Start the month","महीना शुरू करें"),("Type PF and ESIC","PF और ESIC भरें"),("Send reminders","रिमाइंडर भेजें"),("Record the payment","भुगतान दर्ज करें"),("Add the challan","चालान जोड़ें")]
S.append(section("month", "", "Your month in five steps", "पाँच कदम में पूरा महीना",
  P("Every month follows the same order. If you are ever unsure, look at the Next step button beside the client: it always shows the one thing to do now.", "हर महीना इसी क्रम में चलता है। कभी समझ न आए तो ग्राहक के आगे ‘अगला काम’ बटन देखें: वह हमेशा अभी करने वाला एक काम बताता है।"),
  '<ol class="five">' + "".join(f'<li><a href="#s{i+1}"><b>{i+1}</b>{T(a,b)}</a></li>' for i,(a,b) in enumerate(five)) + '</ol>'))

# Step 1
S.append(section("s1", "1", "Start the month", "महीना शुरू करें",
  P("A wage month is the month the salary is for. November wages are worked in December, and the challan is due on the 15th of December.", "वेतन माह वह महीना है जिसकी सैलरी है। नवंबर का वेतन दिसंबर में बनता है, और चालान की आख़िरी तारीख़ 15 दिसंबर होती है।"),
  pair(steps([("Open This month. Use the arrows to reach the right wage month.", "‘इस महीने’ खोलें। तीरों से सही वेतन माह पर जाएँ।"),
              ("Press Start. All active clients are added with their usual fee. Do this once a month.", "‘शुरू करें’ दबाएँ। सभी चालू ग्राहक अपनी सामान्य फीस के साथ जुड़ जाएँगे। यह महीने में एक बार करना है।"),
              ("A new client added later? The button changes to Add 1 new client.", "बाद में नया ग्राहक जुड़ा? बटन ‘1 नया ग्राहक जोड़ें’ बन जाएगा।")]),
    desk(f'''<div class="hdr"><div><div class="eyebrow">{T("WAGE MONTH","वेतन माह")}</div><div class="h1">‹ {T("November 2026","नवंबर 2026")} ›</div></div>{pin(1)}<span class="sp"></span>{chip("Due 15 Dec: 22 days left","देय 15 दिसंबर: 22 दिन बाकी")}</div>
      <div class="card empty"><div class="ico">▦</div><div class="h">{T("November hasn't started yet","नवंबर अभी शुरू नहीं हुआ")}</div>{line(60)}{line(45)}<div>{btn("+ Start November","+ नवंबर शुरू करें","pri",2)}</div></div>'''))))
# Step 2
rows = [("Anand Ram Construction","35865","5584"),("Bharat Steel Pvt Ltd","10306","1503"),("City Care Hospital","",""),("Durga Vaishali Enterprises","","")]
tbl = "".join(f'<tr><td class="n">{i+1}</td><td>{n}</td><td><span class="cell{" on" if i==2 else ""}">₹ {pf}</span></td><td><span class="cell">₹ {es}</span></td><td class="tick">{"✓" if pf else ""}</td></tr>' for i,(n,pf,es) in enumerate(rows))
S.append(section("s2", "2", "Type PF and ESIC", "PF और ESIC भरें",
  P("When the ECR is ready, type each client's PF and ESIC amounts. The app then works out what each client owes.", "ECR बनते ही हर ग्राहक की PF और ESIC राशि भरें। फिर ऐप हिसाब लगा लेता है कि किस ग्राहक पर कितना बकाया है।"),
  pair(steps([("Open Fast entry (or press Enter PF/ESIC on This month).", "‘तेज़ एंट्री’ खोलें (या ‘इस महीने’ पर ‘PF/ESIC भरें’ दबाएँ)।"),
              ("Type the amount. Tab moves to ESIC, Enter moves down to the next client.", "राशि लिखें। Tab से ESIC पर, Enter से नीचे अगले ग्राहक पर जाएँ।"),
              ("A green tick means it is saved. There is no Save button.", "हरा टिक मतलब सेव हो गया। अलग से सेव बटन नहीं है।")])
    + P("Type 0 for a month with no employees. Leave it empty if you don't know yet.", "जिस महीने कोई कर्मचारी नहीं, वहाँ 0 लिखें। अभी पता नहीं तो खाली छोड़ें।"),
    desk(f'''<div class="hdr"><div class="h1">{T("Enter PF and ESIC","PF और ESIC भरें")}</div>{pin(1)}<span class="sp"></span><span class="tot">PF ₹46,171 · ESIC ₹7,087 · {T("Entered","भरे गए")} 2/38</span></div>
      <div class="tscroll"><table class="t"><thead><tr><th>#</th><th>{T("CLIENT","ग्राहक")}</th><th>PF {pin(2)}</th><th>ESIC</th><th>{pin(3)}</th></tr></thead><tbody>{tbl}</tbody></table></div>'''))))
# Step 3
S.append(section("s3", "3", "Send reminders", "रिमाइंडर भेजें",
  P("The app writes the WhatsApp message for you with the right figures and the date to pay by. You only check it and send.", "ऐप सही आँकड़ों और भुगतान की आख़िरी तारीख़ के साथ व्हाट्सऐप संदेश खुद लिखता है। आपको बस देखकर भेजना है।"),
  pair(steps([("On This month (or Today), press Send reminder beside the client.", "‘इस महीने’ (या ‘आज’) पर ग्राहक के आगे ‘रिमाइंडर भेजें’ दबाएँ।"),
              ("Choose हिंदी or English. The client's usual language is already chosen.", "हिंदी या English चुनें। ग्राहक की सामान्य भाषा पहले से चुनी होती है।"),
              ("Read the message; you can change any word.", "संदेश पढ़ें; कोई भी शब्द बदल सकते हैं।"),
              ("Press Send on WhatsApp. WhatsApp opens with the message ready; press send there.", "‘व्हाट्सऐप पर भेजें’ दबाएँ। व्हाट्सऐप संदेश के साथ खुलेगा; वहाँ भेजें दबाएँ।")])
    + '<div class="note">' + T("<b>We pay the challan:</b> the message asks for PF + ESIC + our fee. <b>Client pays the challan:</b> it sends their PF/ESIC figures and asks only for our fee.", "<b>चालान हम भरते हैं:</b> संदेश में PF + ESIC + हमारी फीस माँगी जाती है। <b>चालान ग्राहक भरता है:</b> उन्हें PF/ESIC राशि बताई जाती है और सिर्फ़ हमारी फीस माँगी जाती है।") + '</div>',
    '<div class="two">' + phone(f'''<div class="rowcard"><div class="rc-top"><b>Anand Ram Construction</b><span class="amt">₹41,449<br><small>{T("owes","बकाया")}</small></span></div>{chip("Not notified","सूचना नहीं दी")}<div class="rc-act">{btn("➤ Send reminder","➤ रिमाइंडर भेजें","soft grow",1)}<span class="btn ico">▣</span><span class="btn ico">☏</span></div></div>
      <div class="rowcard ghost">{line(60)}{line(30)}</div>''')
    + sheet("Send dues reminder","बकाया रिमाइंडर भेजें","Anand Ram Construction · "+T("November 2026","नवंबर 2026"),
      f'''<div class="seg"><span class="on">हिंदी</span><span>English</span></div>{pin(2)}
      <div class="msg">{T("Namaste Neha Singh ji,<br>November 2026 PF/ESIC for Anand Ram Construction:<br>PF ₹35,865 · ESIC ₹5,584 · Fee ₹0<br><b>Total payable ₹41,449</b><br>Please pay by 13 Dec.","नमस्ते नेहा सिंह जी,<br>आनंद राम कंस्ट्रक्शन का नवंबर 2026 PF/ESIC:<br>PF ₹35,865 · ESIC ₹5,584 · फीस ₹0<br><b>कुल देय राशि ₹41,449</b><br>कृपया 13 दिसंबर तक भुगतान करें।")}</div>{pin(3)}''',
      btn("◯ Send on WhatsApp","◯ व्हाट्सऐप पर भेजें","wa grow",4)) + '</div>')))

# Step 4
S.append(section("s4", "4", "Record the payment", "भुगतान दर्ज करें",
  P("Record every rupee the moment it comes in, cash or UPI. The receipt is made at once with the next number, ready to send.", "हर रुपया आते ही दर्ज करें, नकद हो या UPI। रसीद तुरंत अगले नंबर के साथ बन जाती है, भेजने के लिए तैयार।"),
  pair(steps([("Press Record payment beside the client (or swipe the client right on the phone).", "ग्राहक के आगे ‘भुगतान दर्ज करें’ दबाएँ (या फ़ोन पर ग्राहक को दाएँ खिसकाएँ)।"),
              ("The full amount owed is already typed. Change it if they paid less.", "पूरा बकाया पहले से लिखा होता है। कम दिया हो तो बदल दें।"),
              ("Choose Cash, UPI or Bank, and who took the money.", "नकद, UPI या बैंक चुनें, और पैसा किसने लिया।"),
              ("Paid more than owed? You must tick the yellow box to keep the extra as advance. This stops typing mistakes.", "बकाया से ज़्यादा दिया? ज़्यादा राशि एडवांस रखने के लिए पीला बॉक्स टिक करना होगा। इससे टाइप की गलती रुकती है।"),
              ("Press Save and issue receipt, then Share on WhatsApp.", "‘सेव करें और रसीद बनाएँ’ दबाएँ, फिर ‘व्हाट्सऐप पर भेजें’।")])
    + P("Government money (PF + ESIC) is always counted first, then our fee. Part payments get a PART PAID seal on the receipt.", "सरकारी राशि (PF + ESIC) हमेशा पहले गिनी जाती है, फिर हमारी फीस। आंशिक भुगतान की रसीद पर ‘आंशिक भुगतान’ की मुहर लगती है।"),
    '<div class="two">' + sheet("Record payment","भुगतान दर्ज करें","Anand Surya Traders",
      f'''<div class="kv"><div>{T("Owes","बकाया")}<b class="warn">₹300</b></div><div>{T("Advance","एडवांस")}<b>₹0</b></div></div>
      {field("Amount received now","अभी मिली राशि","₹ &nbsp; 300",2,True)}
      <div class="lbl">{T("Mode","माध्यम")} {pin(3)}</div><div class="seg"><span class="on">{T("Cash","नकद")}</span><span>UPI</span><span>{T("Bank","बैंक")}</span></div>
      <div class="lbl">{T("Received by","किसने लिया")}</div><div class="seg"><span class="on">{T("Alok","आलोक")}</span><span>{T("Rajeev","राजीव")}</span></div>
      <div class="warnbox">☐ {T("This is ₹99,699 more than they owe — tick if they really paid extra.","यह बकाया से ₹99,699 ज़्यादा है — सच में ज़्यादा दिया हो तो टिक करें।")}{pin(4)}</div>''',
      btn("✓ Save ₹300 and issue receipt","✓ ₹300 सेव करें और रसीद बनाएँ","pri grow",5))
    + f'''<figure class="wf phone"><div class="wf-body"><div class="receipt"><div class="rc-h"><b>{T("Rajeev Kumar Mishra","राजीव कुमार मिश्रा")}</b><span>{T("PAYMENT RECEIPT","भुगतान रसीद")}<br><small>R/2026-27/0012</small></span></div>{line(70)}{line(50)}<div class="rc-amt">₹300</div><div class="seal">{T("PAID","भुगतान प्राप्त")}</div>{line(80)}</div>
      {btn("◯ Share on WhatsApp","◯ व्हाट्सऐप पर भेजें","wa block")}<div class="rowbtns">{btn("PDF","PDF")}{btn("Image","फ़ोटो")}</div></div></figure>''' + '</div>')))

# Step 5
S.append(section("s5", "5", "Add the challan", "चालान जोड़ें",
  P("After the challan is paid on the EPFO or ESIC portal, note it in the app so the month can close.", "EPFO या ESIC पोर्टल पर चालान भरने के बाद उसे ऐप में दर्ज करें, ताकि महीना पूरा हो सके।"),
  pair(steps([("Press Add challan beside the client.", "ग्राहक के आगे ‘चालान जोड़ें’ दबाएँ।"),
              ("Choose PF or ESIC, then type the TRRN (PF) or challan number (ESIC). The amount is filled in for you.", "PF या ESIC चुनें, फिर TRRN (PF) या चालान नंबर (ESIC) लिखें। राशि पहले से भरी होती है।"),
              ("Choose who paid: Us, or Client. Attaching the challan PDF is optional when we paid.", "किसने भरा चुनें: हम, या ग्राहक। हमने भरा हो तो चालान PDF लगाना ज़रूरी नहीं।"),
              ("Press Save challan. The app then offers Tell the client: one tap sends the TRRN on WhatsApp.", "‘चालान सेव करें’ दबाएँ। फिर ऐप ‘ग्राहक को बताएँ’ पूछेगा: एक बटन से TRRN व्हाट्सऐप पर चला जाएगा।")])
    + '<div class="note">' + T("<b>Client paid the challan themselves?</b> Choose Client, attach the PDF or screenshot they sent, tick “I've checked”, and press Confirm. The month shows <i>Proof pending</i> until then.", "<b>चालान ग्राहक ने खुद भरा?</b> ‘ग्राहक’ चुनें, उनका भेजा PDF या स्क्रीनशॉट लगाएँ, ‘मैंने जाँच लिया’ टिक करें और ‘पक्का करें’ दबाएँ। तब तक महीना <i>प्रमाण बाकी</i> दिखाएगा।") + '</div>',
    '<div class="two">' + sheet("Add challan","चालान जोड़ें",T("November 2026","नवंबर 2026"),
      f'''<div class="seg"><span class="on">PF</span><span>ESIC</span></div>{pin(2)}
      {field("TRRN","TRRN","3162612004578")}
      <div class="grid2">{field("Amount","राशि","₹ 35,865")}{field("Paid on","भरने की तारीख","12/12/2026")}</div>
      <div class="lbl">{T("Paid by","किसने भरा")} {pin(3)}</div><div class="seg"><span class="on">{T("Us","हम")}</span><span>{T("Client","ग्राहक")}</span></div>
      <div class="file">📎 {T("Challan PDF or screenshot (optional)","चालान PDF या स्क्रीनशॉट (वैकल्पिक)")}</div>''',
      btn("Save challan","चालान सेव करें","pri grow"))
    + sheet("PF challan saved","PF चालान सेव हुआ",T("November 2026","नवंबर 2026"),
      f'''<div class="okrow"><span class="okc">✓</span>{T("Send the client a WhatsApp message that their challan is paid, with the TRRN?","ग्राहक को व्हाट्सऐप पर बताएँ कि चालान जमा हो गया, TRRN के साथ?")}</div>''',
      btn("◯ Tell the client","◯ ग्राहक को बताएँ","wa grow",4) + btn("Not now","अभी नहीं")) + '</div>')))

# Today
S.append(section("today", "", "Today: your to-do list", "आज: काम की सूची",
  P("Not sure where to start? Open Today. It shows one client at a time, most urgent first: overdue, reminders, challans to file, proof to confirm, receipts to send.", "समझ न आए कहाँ से शुरू करें? ‘आज’ खोलें। यह एक बार में एक ग्राहक दिखाता है, सबसे ज़रूरी पहले: अतिदेय, रिमाइंडर, चालान, प्रमाण, रसीद।"),
  pair(steps([("The reason this client needs you, in one line.", "इस ग्राहक पर ध्यान क्यों चाहिए, एक लाइन में।"),
              ("The big button does the job. When it's done, the next client comes up by itself.", "बड़ा बटन काम करता है। काम होते ही अगला ग्राहक अपने आप आ जाता है।"),
              ("Call / WhatsApp, if you'd rather talk first.", "पहले बात करनी हो तो ‘कॉल / व्हाट्सऐप’।"),
              ("Skip moves to the next client without doing anything.", "‘छोड़ें’ बिना कुछ किए अगले ग्राहक पर ले जाता है।")]),
    phone(f'''<div class="h1s">{T("Today","आज")}</div><div class="muted">{T("35 things to do, most urgent first.","35 काम बाकी, सबसे ज़रूरी पहले।")}</div>
      <div class="qhead"><span>{T("35 left","35 बाकी")}</span><span>⏭ {T("Skip","छोड़ें")}{pin(4)}</span></div>
      <div class="card"><div class="muted">⚠ {T("Overdue · October 2026","अतिदेय · अक्टूबर 2026")}</div><div class="h">Vikram Krishna Grinding Works</div><div class="small">{T("Past the due date with money still owed","आख़िरी तारीख़ निकल गई, पैसा अभी बाकी है")}{pin(1)}</div>
      <div class="kv"><div>PF + ESIC<b>₹49,183</b></div><div>{T("Owes","बकाया")}<b class="bad">₹49,683</b></div></div>
      {btn("⚠ Send overdue reminder","⚠ अतिदेय रिमाइंडर भेजें","pri block",2)}{btn("☏ Call / WhatsApp","☏ कॉल / व्हाट्सऐप","block",3)}</div>'''))))

# Call / WhatsApp + phones
S.append(section("contact", "", "Call or WhatsApp a client", "ग्राहक को कॉल या व्हाट्सऐप",
  P("The phone button ☏ beside every client opens one panel with everything you can say to them.", "हर ग्राहक के आगे फ़ोन बटन ☏ एक पैनल खोलता है जिसमें उनसे बात करने के सारे तरीके हैं।"),
  pair(steps([("Call, or open their WhatsApp chat.", "कॉल करें, या उनकी व्हाट्सऐप चैट खोलें।"),
              ("Ready messages for this month. The one marked Suggested fits best right now; you may pick any.", "इस महीने के तैयार संदेश। ‘सुझाया’ वाला अभी सबसे सही है; आप कोई भी चुन सकते हैं।"),
              ("No phone saved? Type it right here and press Save.", "फ़ोन सेव नहीं है? यहीं लिखकर ‘सेव करें’ दबाएँ।")])
    + '<div class="note">' + T("<b>Adding many phones at once:</b> Clients → Add phones. Type a number, press Enter for the next client. WhatsApp only if it's a different number.", "<b>एक साथ कई फ़ोन जोड़ने हैं:</b> ग्राहक → फ़ोन जोड़ें। नंबर लिखें, अगले ग्राहक के लिए Enter दबाएँ। व्हाट्सऐप तभी भरें जब नंबर अलग हो।") + '</div>',
    sheet("Anand Surya Traders","Anand Surya Traders",T("October 2026","अक्टूबर 2026"),
      f'''<div class="grid2">{btn("☏ Call","☏ कॉल करें","grow")}{btn("◯ WhatsApp","◯ व्हाट्सऐप","wa grow")}</div>{pin(1)}
      <div class="small center">☏ 94311 37497</div>
      <div class="eyebrow">{T("SEND A READY MESSAGE","तैयार संदेश भेजें")} {pin(2)}</div>
      <div class="opt"><span class="oi sug">✦</span><span><b>{T("Overdue reminder","अतिदेय रिमाइंडर")}</b> <span class="chip primary">{T("Suggested","सुझाया")}</span><br><small>{T("Polite reminder that money is still owed","विनम्र याद कि पैसा अभी बाकी है")}</small></span>›</div>
      <div class="opt"><span class="oi">◯</span><span><b>{T("Challan ready","चालान तैयार")}</b><br><small>{T("Their PF/ESIC figures to pay, and our fee","उन्हें भरनी PF/ESIC राशि, और हमारी फीस")}</small></span>›</div>
      <div class="opt"><span class="oi">◯</span><span><b>{T("Challan filed","चालान जमा हुआ")}</b><br><small>{T("TRRN and challan numbers","TRRN और चालान नंबर")}</small></span>›</div>
      <div class="warnbox">{T("No phone saved yet?","अभी फ़ोन नहीं है?")} <span class="inp sm">94304 49312</span> {btn("Save","सेव करें","pri")}{pin(3)}</div>'''))))

# Walk-in
S.append(section("walkin", "", "Walk-in work (बाहरी काम)", "बाहरी काम",
  P("For one-off jobs for anyone who isn't a monthly client: PF claim, registration, appointment letter. It takes about 15 seconds.", "जो मासिक ग्राहक नहीं हैं, उनके एक बार के काम के लिए: PF क्लेम, रजिस्ट्रेशन, नियुक्ति पत्र। लगभग 15 सेकंड लगते हैं।"),
  pair(steps([("Press Walk-in work on This month, Today or More.", "‘इस महीने’, ‘आज’ या ‘और’ पर ‘बाहरी काम’ दबाएँ।"),
              ("Type the name (and phone if you have it). The same person next time is found by phone.", "नाम लिखें (और फ़ोन हो तो वह भी)। अगली बार वही व्यक्ति फ़ोन से पहचान लिया जाएगा।"),
              ("Tap the work; the usual price fills in. Change it if needed.", "काम चुनें; सामान्य दाम भर जाएगा। ज़रूरत हो तो बदलें।"),
              ("Paid now is ticked: saving also makes the receipt. Untick if they'll pay later.", "‘अभी भुगतान हुआ’ टिक है: सेव करने पर रसीद भी बनेगी। बाद में देंगे तो टिक हटा दें।")]),
    sheet("Walk-in work","बाहरी काम",T("PF claim, registration, letters… for anyone","PF क्लेम, रजिस्ट्रेशन, पत्र… किसी के लिए भी"),
      f'''{field("Name","नाम","Sanjeev Kumar Dey",2)}{field("Phone (optional)","फ़ोन (वैकल्पिक)","")}
      <div class="lbl">{T("Work","काम")} {pin(3)}</div><div class="chips"><span class="pillon">{T("PF claim","PF क्लेम")}</span><span class="pill">{T("Registration","रजिस्ट्रेशन")}</span><span class="pill">{T("Appointment letter","नियुक्ति पत्र")}</span><span class="pill">{T("Other","अन्य")}</span></div>
      <div class="grid2">{field("Amount","राशि","₹ 200")}<div class="fld"><div class="lbl">{T("Done by","किसने किया")}</div><div class="seg"><span class="on">{T("Alok","आलोक")}</span><span>{T("Rajeev","राजीव")}</span></div></div></div>
      <div class="lbl">☑ {T("Paid now","अभी भुगतान हुआ")} {pin(4)}</div>''',
      btn("✓ Save and issue receipt","✓ सेव करें और रसीद बनाएँ","pri grow")))))

# Clients
S.append(section("clients", "", "Clients and their history", "ग्राहक और उनका हिसाब",
  P("Open Clients and tap a name. One page shows what they owe, their codes, every month, every payment with its receipt, and every message sent.", "‘ग्राहक’ खोलकर नाम दबाएँ। एक पेज पर दिखेगा: कितना बकाया, उनके कोड, हर महीना, हर भुगतान उसकी रसीद के साथ, और भेजे गए सारे संदेश।"),
  pair(steps([("Record payment, Call, WhatsApp, Statement and Edit are at the top.", "‘भुगतान दर्ज करें’, कॉल, व्हाट्सऐप, खाता विवरण और ‘बदलें’ ऊपर हैं।"),
              ("Statement gives the yearly account (April–March) as a PDF or image, in Hindi or English, ready for WhatsApp.", "‘खाता विवरण’ साल भर (अप्रैल–मार्च) का हिसाब PDF या फ़ोटो में देता है, हिंदी या English में, व्हाट्सऐप के लिए तैयार।"),
              ("Each month has its own next step, a Challan button and the phone button.", "हर महीने का अपना अगला काम, ‘चालान’ बटन और फ़ोन बटन है।")])
    + P("Find any client fast: Ctrl K on the computer. Old spellings from the Excel sheet work too.", "कोई भी ग्राहक जल्दी खोजें: कंप्यूटर पर Ctrl K। एक्सेल की पुरानी स्पेलिंग भी चलेगी।"),
    phone(f'''<div class="small">‹ {T("Clients","ग्राहक")}</div><div class="h1s">Anand Ram Construction</div><div class="small">Neha Singh</div>
      {btn("▣ Record payment","▣ भुगतान दर्ज करें","pri block",1)}
      <div class="grid2">{btn("☏ Call","☏ कॉल करें")}{btn("◯ WhatsApp","◯ WhatsApp")}{btn("▤ Statement","▤ खाता विवरण")}{btn("✎ Edit","✎ बदलें")}</div>{pin(2)}
      <div class="kv"><div>{T("Owes","बकाया")}<b class="warn">₹41,449</b></div><div>{T("Advance","एडवांस")}<b>₹0</b></div></div>
      <div class="card"><div class="rc-top"><b>{T("November 2026","नवंबर 2026")}</b>{chip("Not notified","सूचना नहीं दी")}</div><div class="small">PF ₹35,865 · ESIC ₹5,584 · {T("Owes","बकाया")} ₹41,449</div><div class="rc-act">{btn("➤ Send reminder","➤ रिमाइंडर भेजें","soft")}{btn("▤ Challan","▤ चालान")}{pin(3)}</div></div>'''))))

# Month end
S.append(section("reports", "", "Month end: reports and partner settlement", "महीने का अंत: रिपोर्ट और पार्टनर हिसाब",
  P("Reports answer three questions: does all the money add up, who owes whom between the partners, and is there a backup.", "रिपोर्ट तीन सवालों का जवाब देती है: क्या सारा पैसा मिलता है, पार्टनरों में किसे किसको देना है, और क्या बैकअप है।"),
  '<div class="cards3">' + "".join(f'<div class="card"><div class="h">{T(a,b)}</div><p>{T(c,d)}</p></div>' for a,b,c,d in [
    ("Reconciliation","मिलान","Money received, government money collected and deposited, and what is still to deposit. A red box lists anything that doesn't add up, like a challan amount that differs from the PF entered.","मिली राशि, ली और जमा की गई सरकारी राशि, और अभी कितना जमा करना है। कुछ मेल न खाए (जैसे चालान की राशि भरे PF से अलग हो) तो लाल बॉक्स में दिखता है।"),
    ("Partner settlement","पार्टनर हिसाब","Fees received minus shared expenses, split 50/50. It says plainly, e.g. “Rajeev → Alok ₹550”. Add ink, paper and other shared costs here, and record money handed between partners.","मिली फीस में से साझा ख़र्च घटाकर 50/50 बँटवारा। साफ़ लिखा आता है, जैसे “राजीव → आलोक ₹550”। स्याही, कागज़ जैसे साझा ख़र्च और पार्टनरों के बीच दिया पैसा यहीं दर्ज करें।"),
    ("Receipts and Excel","रसीदें और एक्सेल","Every receipt number in order, including cancelled ones. Excel export gives your old sheet layout, one sheet per month. Download it every month as a safety copy.","हर रसीद नंबर क्रम से, रद्द वाली भी। एक्सेल निर्यात आपकी पुरानी शीट जैसा देता है, हर महीने की एक शीट। हर महीने डाउनलोड करके सँभाल लें।"),
  ]) + '</div>'))

# Mistakes
S.append(section("mistakes", "", "Fixing mistakes", "गलती सुधारें",
  P("Nothing with money in it is ever deleted. You cancel it with a reason, and it stays in history marked cancelled. This keeps the receipt numbers and the accounts honest.", "पैसों से जुड़ी कोई चीज़ कभी मिटाई नहीं जाती। कारण लिखकर उसे रद्द करते हैं, और वह इतिहास में ‘रद्द’ लिखी रहती है। इससे रसीद नंबर और हिसाब सही रहते हैं।"),
  '<div class="maptable">' + "".join(f'<div class="mrow"><b>{T(a,b)}</b><span>{T(c,d)}</span></div>' for a,b,c,d in [
    ("Wrong payment","गलत भुगतान","Client page → Payments → Cancel payment, write why. The receipt is cancelled too. Then record it again correctly.","ग्राहक पेज → भुगतान → ‘भुगतान रद्द करें’, कारण लिखें। रसीद भी रद्द होगी। फिर सही भुगतान दोबारा दर्ज करें।"),
    ("Receipt needs a change","रसीद बदलनी है","Open the receipt → Reissue. The old number is cancelled and a new number is issued.","रसीद खोलें → ‘दोबारा बनाएँ’। पुराना नंबर रद्द होकर नया नंबर बनेगा।"),
    ("Wrong TRRN or challan","गलत TRRN या चालान","Press Challan on that month and save the correct one with a reason. The old one stays as cancelled.","उस महीने पर ‘चालान’ दबाएँ और कारण लिखकर सही सेव करें। पुराना रद्द लिखा रहेगा।"),
    ("Wrong PF or ESIC amount","गलत PF या ESIC राशि","Change it in Fast entry. If money was already received for more than the new amount, cancel that payment first.","‘तेज़ एंट्री’ में बदलें। अगर नई राशि से ज़्यादा पैसा पहले ही मिल चुका है, तो पहले वह भुगतान रद्द करें।"),
    ("Client details","ग्राहक की जानकारी","Client page → Edit. Untick Active for a client who has left; their history stays.","ग्राहक पेज → ‘बदलें’। जो ग्राहक छोड़ गया उसका ‘चालू’ टिक हटाएँ; उसका पुराना हिसाब बना रहेगा।"),
  ]) + '</div>'))

# Status words
st = [("Amounts not entered","राशि बाकी","neutral","PF/ESIC not typed yet → Enter PF/ESIC","PF/ESIC अभी नहीं भरा → PF/ESIC भरें"),
      ("Not notified","सूचना बाकी","neutral","Dues not sent yet → Send reminder","बकाया की सूचना नहीं भेजी → रिमाइंडर भेजें"),
      ("Payment pending","भुगतान बाकी","warning","Reminded, money not in yet → Record payment","सूचना दी, पैसा नहीं आया → भुगतान दर्ज करें"),
      ("Part paid","आंशिक भुगतान","warning","Some money in, some still owed → Record payment","कुछ पैसा आया, कुछ बाकी → भुगतान दर्ज करें"),
      ("Overdue","अतिदेय","danger","Due date passed with money owed → Call or remind","आख़िरी तारीख़ निकल गई, पैसा बाकी → कॉल या रिमाइंडर"),
      ("Challan pending","चालान बाकी","warning","Paid, but challan not recorded → Add challan","भुगतान हुआ, चालान दर्ज नहीं → चालान जोड़ें"),
      ("Proof pending","प्रमाण बाकी","info","Client paid the challan; proof not confirmed → Confirm proof","ग्राहक ने चालान भरा; प्रमाण पक्का नहीं → प्रमाण पक्का करें"),
      ("Share receipt","रसीद भेजनी है","primary","Receipt made, not sent → Share receipt","रसीद बनी, भेजी नहीं → रसीद भेजें"),
      ("Done","पूर्ण","success","Paid, challan filed, receipt sent. Nothing to do.","भुगतान, चालान, रसीद सब पूरा। कुछ नहीं करना।")]
S.append(section("status", "", "What the status words mean", "स्थिति के शब्दों का मतलब",
  P("Every client shows one status. The arrow shows what the Next step button will do.", "हर ग्राहक की एक स्थिति दिखती है। तीर बताता है कि ‘अगला काम’ बटन क्या करेगा।"),
  '<div class="maptable">' + "".join(f'<div class="mrow">{chip(a,b,tone)}<span>{T(c,d)}</span></div>' for a,b,tone,c,d in st) + '</div>'))

# Phone tricks + FAQ
S.append(section("tips", "", "Shortcuts and common questions", "शॉर्टकट और आम सवाल",
  '<div class="cards3">' + "".join(f'<div class="card"><div class="h">{T(a,b)}</div><p>{T(c,d)}</p></div>' for a,b,c,d in [
    ("Swipe on the phone","फ़ोन पर खिसकाएँ","On This month, swipe a client right to record a payment, left to call or WhatsApp.","‘इस महीने’ पर ग्राहक को दाएँ खिसकाएँ तो भुगतान, बाएँ खिसकाएँ तो कॉल या व्हाट्सऐप।"),
    ("Ctrl K on the computer","कंप्यूटर पर Ctrl K","Opens search: any client by any spelling, any page, Record payment, Walk-in work, Start month, Excel export.","खोज खुलती है: कोई भी ग्राहक किसी भी स्पेलिंग से, कोई भी पेज, भुगतान, बाहरी काम, महीना शुरू, एक्सेल।"),
    ("Both partners at once","दोनों पार्टनर एक साथ","Everything saves straight to one shared account. A payment Alok records shows on Rajeev's phone too.","सब कुछ सीधे एक साझा खाते में सेव होता है। आलोक का दर्ज भुगतान राजीव के फ़ोन पर भी दिखेगा।"),
  ]) + '</div>'
  + '<div class="faq">' + "".join(f'<details><summary>{T(q,qh)}</summary><p>{T(a,ah)}</p></details>' for q,qh,a,ah in [
    ("Does the app send WhatsApp messages by itself?","क्या ऐप खुद व्हाट्सऐप भेजता है?","No. It writes the message and opens WhatsApp; you press send. The app then marks the client as told.","नहीं। ऐप संदेश लिखकर व्हाट्सऐप खोलता है; भेजें आप दबाते हैं। फिर ऐप ग्राहक को ‘सूचना दी’ मान लेता है।"),
    ("The client says they paid, but nothing shows.","ग्राहक कहता है भुगतान किया, पर दिख नहीं रहा।","Only payments recorded in the app count. Check with your partner, then record it with the date it was received.","सिर्फ़ ऐप में दर्ज भुगतान गिने जाते हैं। पार्टनर से पूछें, फिर मिलने की तारीख़ के साथ दर्ज करें।"),
    ("A client paid in advance for next month.","ग्राहक ने अगले महीने का पहले दे दिया।","Record it and tick the advance box. Next month, the payment screen asks “Use ₹X advance?”.","दर्ज करें और एडवांस वाला बॉक्स टिक करें। अगले महीने भुगतान स्क्रीन पूछेगी “₹X एडवांस इस्तेमाल करें?”।"),
    ("Can I change the WhatsApp wording?","क्या व्हाट्सऐप के शब्द बदल सकते हैं?","Yes: Settings → WhatsApp messages, in Hindi and English, with a live preview. Words in {curly brackets} fill in by themselves.","हाँ: सेटिंग → व्हाट्सऐप संदेश, हिंदी और English में, नमूने के साथ। {ऐसे} लिखे शब्द अपने आप भरते हैं।"),
    ("Is this a tax invoice?","क्या यह टैक्स बीजक है?","No. Receipts say “This is a payment receipt, not a tax invoice.”","नहीं। रसीद पर लिखा होता है “यह भुगतान रसीद है, कर बीजक नहीं।”"),
  ]) + '</div>', ""))

toc = [("start","Before you start","शुरू करने से पहले"),("map","Find your way","स्क्रीन पहचानें"),("month","Five steps","पाँच कदम"),("today","Today","आज"),("contact","Call / WhatsApp","कॉल / व्हाट्सऐप"),("walkin","Walk-in work","बाहरी काम"),("clients","Clients","ग्राहक"),("reports","Month end","महीने का अंत"),("mistakes","Fixing mistakes","गलती सुधारें"),("status","Status words","स्थिति के शब्द"),("tips","Questions","सवाल")]

css = open(__import__("os").path.join(__import__("os").path.dirname(__file__), "style.css")).read()
page = f'''<title>PF ESIC Desk Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap">
<style>{css}</style>
<div class="topbar"><div class="tb-in"><span class="logo">₹</span><b>{T("PF ESIC Desk · How to use","PF ESIC डेस्क · उपयोग गाइड")}</b><span class="sp"></span>
<div class="langsw" role="radiogroup" aria-label="Language / भाषा"><button type="button" id="b-en" role="radio" data-l="en">English</button><button type="button" id="b-hi" role="radio" data-l="hi" lang="hi">हिंदी</button></div></div></div>
<main class="wrap">
<header class="hero"><div class="eyebrow">{T("GUIDE FOR ALOK AND RAJEEV","आलोक और राजीव के लिए गाइड")}</div>
<h1>{T("Run the whole month from one screen","पूरा महीना एक स्क्रीन से चलाएँ")}</h1>
<p class="lead">{T("Each part shows the screen as a drawing with numbered marks; the numbers match the steps beside it. Read it once, then keep it for when you forget a step.","हर हिस्से में स्क्रीन का चित्र है जिस पर नंबर लगे हैं; वही नंबर बगल के कदमों में हैं। एक बार पढ़ें, फिर कोई कदम भूलें तो यहाँ देख लें।")}</p>
<nav class="toc">{"".join(f'<a href="#{i}">{T(a,b)}</a>' for i,a,b in toc)}</nav></header>
{"".join(S)}
<footer class="foot-note">{T("Screens in the app may look slightly different on your phone. The buttons and their names are the same.","आपके फ़ोन पर ऐप की स्क्रीन थोड़ी अलग दिख सकती है। बटन और उनके नाम वही रहेंगे।")}</footer>
</main>
<script>
(function(){{
  var root=document.documentElement;
  function set(l){{root.setAttribute("data-lang",l);document.getElementById("b-en").setAttribute("aria-checked",l==="en");document.getElementById("b-hi").setAttribute("aria-checked",l==="hi");try{{localStorage.setItem("guide-lang",l)}}catch(e){{}}}}
  var start="en";try{{start=localStorage.getItem("guide-lang")||((navigator.language||"").slice(0,2)==="hi"?"hi":"en")}}catch(e){{}}
  if(location.hash==="#hi")start="hi";
  set(start);
  document.querySelectorAll(".langsw button").forEach(function(b){{b.addEventListener("click",function(){{set(b.getAttribute("data-l"))}})}});
}})();
</script>'''
open(__import__("os").path.join(__import__("os").path.dirname(__file__), "pf-esic-guide.html"),"w").write(page)
print(len(page))
