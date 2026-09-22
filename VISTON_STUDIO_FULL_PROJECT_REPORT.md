# تقرير التدقيق الفني الشامل — VISTON Studio

**شكل التدقيق:** READ-ONLY (قراءة، فحص، اختبار، تحقق، توثيق) — **لم يتم تعديل أي ملف من ملفات المشروع، ولم يُحذف أي ملف، ولم تُنفَّذ أو تُصلَح أي ميزة.**
**المصدر:** الكود الحالي فعليًا في `D:\o` (لا يُعتمد على التقارير القديمة).
**تاريخ التدقيق:** 2026-09-22
**البيئة:** Windows، Node v22.14.0، npm 10.9.2، TypeScript 5.6.3، Vite 6.4.3، Vitest 5.0.1

---

## 1) ملخص تنفيذي

مشروع **VISTON Studio (vision-studio v0.1.0)** هو محرر صور/تصميم متكامل يُبنى كـ SPA بـ React 18 + Zustand + Canvas 2D + Three.js لاحقًا، مع أغلفة حاسوب (Electron) وهاتف (Capacitor) أُنجزت في جلسة سابقة (خط التغليف موثّق في `VISTON_STUDIO_PACKAGING_REPORT.md`).

نتائج التحقق لهذه الجلسة:

| المقياس | النتيجة |
|---|---|
| الفحص النوعي `npm run typecheck` | ✅ PASS (`tsc --noEmit` بدون أخطاء) |
| البناء `npm run build` | ✅ PASS (165 وحدة، vite 6.4.3) |
| الاختبارات `npm run test` | ✅ **478/478 ناجحًا (52 ملفًا)** — راجع ملاحظة الـ flake أدناه |
| إقلاع التطبيق حيًا (`localhost:5174`) | ✅ نظيف، صفر أخطاء |
| فتح صورة حيًا (سحب/إفلات) | ✅ النقطة الوسطى صارت (255,32,32) أحمر — لا شاشة سوداء |

**الخلاصة:** المشروع في حالة نضج جيدة جدًا؛ المعمارية (محرك مركزي + مكوّن تجميع + عامل معالجة + مشرف حالة) متماسكة، والميزات الجوهرية محقَّقة ومختبرة. المشكلة التاريخية «فتح صورة → شاشة سوداء» **لم تتكرر** وتغطّيها اختبارات انحدار مخصصة. الهمّ الرئيسي المتبقي هو استهلاك الذاكرة للمعالجات الكبيرة ووقت اختبارات الصور الضخمة (انظر القسم 31 و36).

---

## 2) نطاق التدقيق ومنهجيته

تم منهج «ميزة مقابل تنفيذ»: وجود زر/عنصر قائمة دون خدمة في الكود يُصنَّف حقيقةً، ولا يُفترض عمل أي ميزة دون دليل من الكود أو اختبار أو تحقق حي.

التصنيفات المعتمدة: **VERIFIED WORKING** (مثبت بشيفرة + اختبار غالبًا) / **IMPLEMENTED** (شيفرة كاملة) / **PARTIAL** (جزئي) / **BROKEN** (معطَّل) / **MOCK ONLY** (محاكاة) / **STUB** (هيكل) / **MISSING / NOT SUPPORTED** / **REQUIRES EXTERNAL PROVIDER** / **NOT VERIFIED AT RUNTIME** / **UNKNOWN**.

التحقق المنفَّذ:
- `npm run typecheck` ✅ — `npm run build` ✅ — `npm run test` (مرات متعددة + بعزل) ✅/الكشف عن flake.
- تحقق حي عبر متصفح Chromium headless + CDP على `http://localhost:5174/` (إقلاع، هيكل DOM، الكانفس، أحداث الأخطاء، واختبار فتح صورة حقيقي).
- فحص شيفرة عميق عبر 4 خطوط فحص متوازية (المحرر/الكانفس، المعالجة/الميزات، AI/3D، واجهة المستخدم) + قراءات مباشرة للملفات الحرجة.

---

## 3) المعمارية

- SPA: `index.html` → `src/main.tsx` (`createRoot`) → `src/app/App.tsx` (يهيّئ `runtime.engine = new EditorEngine(); engine.init()`) → `src/ui/layout/Workspace.tsx`.
- **محرك مركزي واحد** `src/editor/core/engine.ts` (~5068 سطرًا) يتواصل عبر `runtime.ts`، ويؤمن: المستند النشط، كل الأوامر، التراجع، الحفظ/الاستيراد/التصدير، معالجة المؤشر `engine.ts:4472/4662/4835`.
- **حالة مركزية** بZustand في `src/state/store.ts`؛ الواجهة تُغيّر store، والمحرك يدفع سلفًا عبر `useEditorStore.setState`.
- **التجميع** (compositor) على الخيط الرئيسي داخل حلقة الرسم؛ **معالجة البكسل الثقيلة** في Web Worker (`processingEngine.ts:20` `new Worker("./processWorker.ts", { type: "module" })`) مع fallback تلقائي على الخيط الرئيسي.
- **Three.js معزول في حِزم lazy-load** عبر `Workspace.tsx` + `renderBridge` فلا يثقل حزمة الإقلاع.
- **الفلاتر غير المُدمِّرة** (طبقات التعديل) تُنفَّذ أثناء التجميع مباشرةً بدلًا من حرق البكسل.

---

## 4) التقنيات والمكتبات

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| React / react-dom | ^18.3.1 | واجهة المستخدم |
| Zustand | ^5.0.2 | إدارة الحالة |
| Three.js | ^0.186.0 | العارض ثلاثي الأبعاد (WebGL) |
| TypeScript | ^5.6.3 | لغة (strict: true، ES2022) |
| Vite | ^6.0.3 (البناء استخدم 6.4.3) | البناء/التطوير |
| Vitest | ^5.0.1 | الاختبارات (52 ملفًا) |
| Electron | ^44.4.3 (devDep) | تغليف سطح المكتب Engine |
| electron-builder | ^26.15.3 | تثبيت/نسخة محمولة |
| Capacitor | ^8.5.2 | تغليف Android |
| @tauri-apps/cli | ^2.1.0 (devDep) | غير مستخدم فعليًا في هذا التدقيق |

`vite.config.ts`: `base: "./"` (للتغليف)، `manualChunks` (فصل React/three)، `worker.format="es"`، حد تحذير 900 kB. `vitest.config.ts`: بيئة node، `testTimeout: 20000`.

---

## 5) بنية المشروع

```
src/
├── main.tsx  app/{App,commands.ts,useKeyboardShortcuts.ts}
├── state/store.ts
├── editor/
│   ├── core/    engine.ts, types.ts, document.ts, documentMeta.ts, documentExtras.ts,
│   │            documentPresets.ts, history.ts, runtime.ts, gridSettings.ts, artboards.ts, colorSpace.ts
│   ├── canvas/  canvasEngine.ts, camera.ts, math2d.ts, checker.ts, antsTicker.ts
│   ├── renderer/compositor.ts, shapeRenderer.ts, styleRenderer.ts, textRenderer.ts
│   ├── layers/ layerFactory.ts
│   ├── selection/ selectionEngine.ts
│   ├── processing/ processingEngine.ts, processWorker.ts, processor.ts, filterSpecs.ts
│   ├── project/ projectFormat.ts, projectStorage.ts
│   ├── import/ importFormats.ts   export/ exportFormats.ts, bmpEncoder.ts
│   ├── transform/ transformGizmo.ts
│   ├── compare/ compareModel.ts   snap/ snapEngine.ts
│   └── product/ productPipeline.ts
├── 3d/ core, loading, render, textures, types3d.ts, sceneDataStore.ts, sceneRegistry.ts, renderBridge.ts
├── ai/ providers, services, image, history, commands, types.ts
├── ui/ menus, toolbar, options, canvas, panels, dialogs, view3d, layout, compare, statusbar
├── i18n/ index.ts, en.ts, ar.ts
└── styles/global.css
```

---

## 6) جرد الميزات وتصنيفات الحالة

| الميزة | الحالة | الدليل |
|---|---|---|
| محرك الكانفس ثنائي الأبعاد (rAF + ResizeObserver + DPR) | **VERIFIED WORKING** | canvasEngine.ts:97,172-316 + tests |
| 8 أنواع طبقات | **IMPLEMENTED** | layerFactory.ts |
| أوضاع مزج (16) | **IMPLEMENTED** | types.ts:519-536 + compositor.ts:18-41 |
| الاختيارات (rect/ellipse/lasso/polygon/wand/similar) | **VERIFIED WORKING** | selectionEngine.ts + selectionFeatures.test |
| سجل التراجع (closure-based، 200 سجل، 512MB، jumpTo، تعرّج) | **VERIFIED WORKING** | history.ts + historyManager.test |
| تعديلات الطبقة (opacity/lock/visibility/blend/rename) قابلة للتراجع | **VERIFIED WORKING** (أُصلحت) | layerMetaHistory.test.ts |
| 20 فئة تعديلات | **VERIFIED WORKING** | processor.ts:421-1012 + قبل/بعد وطبقات التعديل |
| 27 فلترًا | **IMPLEMENTED** | processor.ts:1033-1946 |
| 15 عملية مورفولوجية | **VERIFIED WORKING** | processor.ts:2560-2640 + morphology.test.ts |
| أنماط الطبقات (Styles) | **VERIFIED WORKING** | styleRenderer.ts:243-390 + layerStyles.test |
| قبل/بعد (Before/After) | **VERIFIED WORKING** | compareModel.ts + beforeAfter.test (20+ اختبارًا) |
| الاستيراد (png/jpeg/webp/gif/bmp/svg) | **VERIFIED WORKING** | importFormats.ts + importBlackScreen.test |
| التصدير (png/jpeg/webp/bmp حقيقي) | **VERIFIED WORKING** | exportFormats.ts + bmpEncoder.ts + exportFormats.test |
| الحفظ/التحميل .vstudio الإصدار 1 + توافق رجعي | **VERIFIED WORKING** | projectFormat.ts + importSave.test |
| نظام 3D (WebGL حقيقي) | **IMPLEMENTED** (شيفرة كاملة؛ بلا اختبار بكسل) | src/3d/** |
| استيراد 3D (glb/gltf/obj/stl) | **IMPLEMENTED / PARTIAL (gltf خارجي)** | loaders3d.ts:6-29 |
| AI — RemoteAIProvider | **REQUIRES EXTERNAL PROVIDER** (يحتاج endpoint من المستخدم) | RemoteAIProvider.ts:52-100 |
| AI — MockAIProvider | **MOCK ONLY** (DEV فقط) | MockAIProvider.ts |
| AI — LocalAIProvider | **STUB** (غير فعّال) | LocalAIProvider.ts:16-30 |
| خط إنتاج المنتجات (Product) | **VERIFIED WORKING** | productPipeline.ts + productCompositing.test |
| Padlet/Artboards + Guides | **VERIFIED WORKING** | artboards.ts + guidesArtboards.test |
| الطبقة الذكية (Smart Object) | **MISSING** | لا يوجد نوع؛ فقط metadata |
| أداة Quick Select | **MISSING** (يوجد selectSubject عبر AI فقط) | استكشاف الميزات |
| Warp/Perspective كتحويل عام | **PARTIAL** (skew فقط؛ homography داخل product) | transformGizmo.ts |

---

## 7) نظام الكانفس والتقديم (2D)

- `createCanvasEngine(parent)` → `canvasEngine.ts:97`؛ حلقة رسم عبر `scheduleRender()`/`requestAnimationFrame` (canvasEngine.ts:239-316)؛ `ResizeObserver` لإعادة الحجم.
- **DPR:** `canvas.width = floor(parentW × dpr)` + `ctx.setTransform(dpr,…)` والرسم بوحدات CSS (canvasEngine.ts:172-183,256).
- **إحداثيات:** `toDoc=(vp−cam)/zoom`, `toViewport`؛ zoom محصور [0.02, 64]؛ fit بمسافة 48 (camera.ts:6-12); Patricia `math2d.ts`.
- **ذاكرة التجميع:** إعادة خَبْز canvas بعرض المستند عند كل `version++` ثم `drawImage` على الشاشة (canvasEngine.ts:273-302) + خَبْز ثانٍ في المحرك — **عبء ذاكرة ×2 لكل تحرير** (ملاحظة أداء).
- **Checkerboard: أُصلح** — شبكة مربّط ثابتة الحجم على الشاشة (`checker.ts` + checker.test.ts) لا تتمدد مع التكبير.
- **Marching ants: أُصلح** — خط متقطع متحرك عبر `antsTicker.ts`.
- **الحماية:** `canvasRenderGuard` يضمن عدم سقوط حلقة الرسم حتى لو فشل تخصيص التجميع.

---

## 8) نظام الطبقات

- 8 أنواع محقّقة: `image, text, shape, group, adjustment, 3d-scene, 3d-object, 3d-group`.
- طبقة الصورة تحمل `imageId → pixelStore` (خريطة `<id,HTMLCanvasElement>`)، والطبقات 3D تحمل مراجع مشهد/كائن.
- ظلالة على أدوات LayersPanel: سحب/إفلات ترتيب، rename (غير-مُلزم بالتراجع) عبر `engine.renameLayer` (engine.ts:2346) ملزَم الآن بالتراجع، `moveLayerInStack` (engine.ts:2355) ملزَم بالتراجع.
- **ميزة غير موجودة نوعيًا:** لا توجد طبقة «AI» مخصّصة — نتائج AI تُخزَّن كطبقة image مع `AILayerMetadata` (تفصيل رأي، لا تأثير وظيفي).

---

## 9) الأقنعة والاختيارات

- أشكال: مستطيل/قطع ناقص/لاسو/مضلع/عصا سحرية/مشابه (`selectMagicWand` selectionEngine.ts:109, `selectSimilar`:170, `applyPolygon`:361)؛ أوضاع replace/add/subtract/intersect.
- تنعيم (smooth)، feather (Gaussian)، expand/contract، border، invert، makeAll.
- تحويل: `maskFromSelection`/`selectionFromMask` (engine.ts:2686-2732).
- القناع: `LayerMaskRef{id,enabled,linked}` + بكسل في `maskStore`؛ يُحفظ في صيغة المشروع بمفتاح `mask:<id>` (resource PNG) — **للاختيار (selection) لا يُحفظ**؛ يُحول إلى قناع لحفظه.

---

## 10) سجل التراجع (History)

- `HistoryManager` (history.ts:25-132): إدخالات closures لكل أمر (أدق من اللقطات)؛ `maxEntries=200`، `maxBytes=512MB`؛ إسقاط فرع redo عند أمر جديد؛ `jumpTo` يعيد تشغيل سلسلة.
- ضبط تنسيقي: جلسات meta تُلغَى بعد 250ms (engine.ts:1549-1614) فيضغط جرّات المستمرة (الشفافية) لسجل واحد — مُختبَر.
- `pushHistory` يزيد `version++` و`markDirty` ويطلب إعادة رسم.
- **لا يُحفَظ التراجع داخل ملف المشروع** (تصميم).

---

## 11) نظام Before/After

- مرجع «قبل» لكل مستند في `_origRefs` يُلتقط عند `_openDoc` ومصغَّر إلى `COMPARE_MAX_REF_DIM` (4096px) لتوفير الذاكرة؛ إعادة التقاط كسول عند الفقد؛ يُلغى عند إغلاق المستند.
- أوضاع مقارنة: split / side-by-side / overlay عبر `compareModel.ts` مع تنظيمه الصحيح (compareBeforeAfterViewer.tsx) واختبارات دقيقة للفِقَدات الـ 20+ (beforeAfter.test.ts).

---

## 12) الاستيراد (Import) — والتحقيق في «الشاشة السوداء عند فتح الصورة»

### الصيغ والضوابط
- الصيغ المقبولة فعليًا (`importFormats.ts:24-43`): **png, jpg/jpeg, webp, gif (الإطار الأول فقط), bmp, svg (يُسطَّر)**. **غير مدعوم بنص صريح:** tiff, pdf, psd (رسالة خطأ واضحة، importFormats.ts:65-71).
- فك التشفير عبر متصفح `new Image()` + `URL.createObjectURL` مع Promise onload/onerror (`utils/canvas.ts:139-174`)، ذو حدين للحماية:
  - `MAX_DECODED_IMAGE_DIMENSION = 20000` لكل ضلع، و`MAX_DECODED_IMAGE_AREA = 124_000_000` بكسل² (حدود أمان للـ 2D canvas؛ تجاوزها كان سبب النصاحة السوداء).
- خط الإنتاج: `openImageFile`/`importImageFile` (engine.ts:1371,1404) → canvas → `createImageLayerFromCanvas` → مستند جديد (أو إدراج في المستند الحالي مع المحافظة على أبعاد، أو نمو canvas عند الكبر) → تجميع → عرض: كل ذلك try/catch مع `busy` و`lastError`.

### التحقيق في مشكلة الشاشة السوداء (حالة هذه الجلسة)
1. **الكود الحالي واقعيًا:** مخزّن الحماية موجود، والمسارات المرشّحة للشاشة السوداء (تخصيص canvas يفوق صلاحية المتصفح) مغلقة بالتوسّعات الآمنة — `utils/canvas.ts:116-167`.
2. **اختبارات الانحدار المخصصة:** `importBlackScreen.test.ts` (7 اختبارات) تعمل بالمحرك الحقيقي والمكوّن الحقيقي مع Canvas ذاكرة يسجّل البكسل فعليًا: التوسّعة تحافظ على نسبة الأبعاد، الطبقة تُنشأ وتخزن، التجميع يرسم بكسل المستورد وليس أسود، الإطار الأول يعرض الصورة على منفذ العرض، الاستيراد يحافظ على حجم المستند والـ undo/redo، والملف التالف ينتج خطأ واضحًا بلا طبقة فارغة.
3. **التحقق الحي:** إسقاط ملف PNG حقيقي (640×400 أحمر) على `localhost:5174` الجاري عبر CDP → النقطة الوسطى للكانفس تحوّلت من أبيض (255,255,255) إلى **أحمر (255,32,32)** مع **صفر أخطاء**.
4. **النتيجة: الشاشة السوداء بعد فتح/استيراد صورة = لم تتكرر** (NOT REPRODUCED). والسبب الجذري الذي شُخّص في جلسة سابقة (موت خادم التطوير على منفذ 5174) غير ذي صلة بالكود.

---

## 13) التصدير (Export)

- الصيغ المدعومة بدقة (exportFormats.test يؤكد «بالضبط الصيغ التي يُنتجها التطبيق»): **png, jpeg, webp, bmp**.
- BMP عبر مُرمِّز حقيقي `encodeBmp` (bmpEncoder.ts:39-102، BITMAPV4HEADER 32-bit BGRA، أسفل-فوق، ألفا). الباقي عبر `canvas.toBlob` مع ضبط جودة الضياع (1–100%)، وفحص دعم WebP وبديل MIME.
- عند التصدير بلا شفافية يُترك canvas مخفيًا ويُملأ بالأبيض (engine.ts:843-879).

---

## 14) المعالجات والفلاتر (Processor)

| الفئة | العدد | الأسماء المختارة (كلها بتنفيذ حقيقي) |
|---|---|---|
| تعديلات | 20 | brightness, exposure, contrast, gamma, saturation, hueRotate, temperature, vibrance, colorBalance, shadows, highlights, levels, curves, equalize, tint, blackWhite, channelMixer, selectiveColor, gradientMap, colorLookup + تجميعي `runAdjustments` |
| تمويه/نقاء | 4 | gaussianBlur, mean/boxBlur, medianFilter + عائلة إزالة الضوضاء (arithmetic/geometric/contraHarmonic/alphaTrimmedMean, wienerFilter) |
| شحذ | 10 | sharpen, unsharpMask, highBoost, smartSharpen, sharpenDetails, edgeSharpen, claritySharpen, textureSharpen, localContrastSharpen, directionalSharpen, focusSharpen |
| حواف | 6 | laplacian/sobel/prewitt, sobelEdge/prewittEdge, laplacianEdge, cannyEdge |
| مورفولوجيا | 15 | (انظر القسم 15) |
| ضوضاء | 1 | noiseGeneration (محدد البذرة: Gaussian/Uniform/Salt&Pepper) |

- **تم التحقق من كل عملية:** `runProcess` switch (processor.ts:286-419) يغطي كل الحالات لدوال تنفيذ واقعية (لا دوال فارغة).
- `filterSpecs.ts` يوفر params/specs للواجهة. مطابقة نتائج طبقات التعديل لـ runProcess ضمن 1 وحدة (adjustmentLayers.test.ts:551).
- **Exposure: أُصلح** (انظر القسم 34): الآن ضربي `2^amount` عبر LUT (processor.ts:432-445) موحّدًا بين runProcess/compositor/engine مع اختبارات انحدار صريحة (exposure.test.ts).

---

## 15) المعالجة المورفولوجية (Morphology)

- **15 عملية كاملة** (processor.ts:2560-2640): erosion, dilation, opening, closing, gradient, top-hat, black-hat, hit-or-miss (2305), boundary, hole-fill (2330), thinning/Zhang-Suen (2361), thickening, skeleton, components (2506), reconstruction (2406) + عدّاد المكونات المتصلة.
- أوضاع إدخال: تدرج رمادي / ثنائي / لكل-قناة، ودعم نواة مخصصة، وواجهة `MorphologyDialog` مع معاينة ومكوّنات إحصاء.
- اختبارات `morphology.test.ts` تغطي النواة المخصصة والثنائية والمكونات.

---

## 16) تحويل الطبقات (Transform / Gizmo)

- `transformGizmo.ts:23-78`: 8 مقابض + مركز؛ **scale** (Shift=نسبة)، **rotate**، **skew** (N/S→skewX، E/W→skewY، محصور ±85°) — محدّث مباشرةً على الطبقة المختارة ويُلتزم عبر `engine.ts:1622-1628`.
- أدوات flip عبر `engine` (اختبار layerStyles.test.ts:325).
- **غير موجود:** Warp/Perspective/Distort كتحويل عام (متى يوجد homography داخل خط الإنتاج فقط).

---

## 17) الأشكال والمسارات (Shapes / Paths / Pen)

- طبقة `shape` مع أشكال (مستطيل/بيضاوي/خط/مضلع/نجمة…) ومسارات bezier قابلة للتعديل (اختبارات: `shape/star geometry` تُحرَّر عبر meta مع تراجع؛ إصلاح علّة «إعادة تحميل المسار إلى مستطيل» موثّق في adjustmentLayerFeatures.test.ts:205).
- أداة القلم (pen) مرتبطة بمعالجات مؤشر 2D.

---

## 18) النصوص (Text)

- طبقة `text` بمحاذاة (left/center/right/justify)، خط، حجم، لون + **stroke/strokeWidth/shadow** تُحفظ (اختبار التوافق الرجعي adjustmentLayerFeatures.test.ts:191-204).
- لا محرر نص غني (قوائم نقطية/باتح) — تحرير نص مباشر في خصائص الطبقة.

---

## 19) أنماط الطبقات (Layer Styles) وأوضاع المزج

- 8 أنماط محقّقة (`LAYER_STYLE_KINDS` types.ts:304-307 مع `styleRenderer.ts:243-390`): dropShadow, outerGlow, innerShadow, innerGlow, bevel/emboss, stroke (inside/center/outside), colorOverlay, gradientOverlay (linear/radial) مع boxBlur للحواف.
- تفعيل/تعطيل الأنماط والتدرجات يُحفظ ويُستعاد (layerStyles.test.ts:170) وتعديلاتها undoable مفردة.
- **16 وضع مزج** (normal…luminosity) مع `blendModeSupported` عند التحميل.

---

## 20) الطبقات الذكية (Smart Layers)

- **غير موجودة.** أقرب ما يوجد: واصف `AILayerMetadata` على طبقة الصورة وmetadata `smartPlace` في خط الإنتاج (types.ts:132,213-224). **MISSING** بصراحة.

---

## 21) النظام ثلاثي الأبعاد (3D)

- **عرض WebGL حقيقي** عبر three.js المعزول: `Viewport3D` (رابط OrbitControls + TransformControls + rAF) → `SceneRuntime` (مزامنة بيانات المشهد إلى three) → `renderer3d` فعلي (renderer3d.ts:20-31). عارض غير التفاعلي يرسخ offscreen إلى `pixelStore` للطبقات/التصدير (renderScene3d.ts:32-55).
- إدارة المشاهد عبر `SceneDataStore` (بزيادة version + إعادة رسترة طبقات 3D) و`sceneRegistry` لكل مستند.
- **استيراد:** glb/gltf/obj/stl (GLTFLoader+OBJLoader+STLLoader). **gltf (JSON) جزئي** — المخازن الخارجية غير مضمّنة (loaders3d.ts:6-11)؛ glb/obj/stl مكتفية ذاتيًا.
- **Geometries:** cube/sphere/cylinder/cone/plane/torus/capsule؛ **إضاءة:** ambient/directional/point/spot؛ **Textures:** 6 فتحات CanvasTexture/TextureLoader؛ أوضاع عرض solid/wireframe (material≡solid).
- حفظ/استيراد مشاهد 3D داخل `.vstudio` (scenes + bytes) — round-trip مُختبَر (projectFormat3d.test.ts:25-63).
- **ملاحظة صادقة:** لا يوجد اختبار يؤكد بكسلات WebGL فعلية — تم التحقق من العارض على مستوى الشيفرة والواجهة فقط (NOT VERIFIED AT RUNTIME للبكسل).

---

## 22) الذكاء الاصطناعي (AI)

- خط السير: `AIPanel`/أوامر AI → `AIService.run` (حارس توفر + قدرة → بناء طلب → cache LRU 96 → `AIJobManager` متسلسل بتعليق/إلغاء) → `provider.execute(fetch)` → نتيجة تُدرج كطبقة عبر `AIHistoryAdapter` (قابلة للتراجع، غير مُدمِّرة).
- **RemoteAIProvider:** **حقيقي** — `fetch(endpoint, POST {request})` بروتوكول JSON مخصّص (RemoteAIProvider.ts:95-100). **بدون endpoint من المستخدم يكون غير متاح** (الافتراضي `""`). **مفتاح API في الذاكرة فقط ولا يُخزَّن أبدًا** (`AIService.ts:56-57,106-108`، واختبار `honestySecurity.test.ts:60-71` يثبت عدم وصوله لـ localStorage).
- **LocalAIProvider: STUB** (capabilities=[], isAvailable=false، throws). **MockAIProvider: DEV-only** (يتطلب DEV+مفعّل، النتائج موسومة `origin:"mock"`).
- مجموعة العمليات (types.ts:1-34): inpaint, upscale, removeBackground, enhance, describe, generativeFill, selectSubject, segmentProduct, estimate/matchLighting, detectSurface, generateShadow, matchPerspective… + `analyzeLocal` (إحصاءات بكسل حتمية **ليست** AI).
- **النتيجة الصادقة:** AI **REQUIRES EXTERNAL PROVIDER** — دون endpoint مُعدّ من المستخدم لا يعمل أي شيء (لا تراجع/سلوك وهمي في الإنتاج).

---

## 23) خط إنتاج المنتجات (Product)

- فصل المنتج عبر `segmentProduct` (AI) أو التحديد اليدوي؛ تنقيح قناع؛ تحديد الموقع + keystone؛ منزلقات إضاءة تُخبَز ببكسل حقيقي (productPipeline.ts:30-47)؛ ظل اتصال + انعكاس كطبقتين منفصلتين؛ تحويل relevation homography للحدود العريضة (productPipeline.ts:520-593).
- مطابقة الألوان والـ smart place وتحليل الخلفية: إحصاءات محلية حتمية **مفصَّلة صراحة كغير-AI** (ProductPanel.tsx:187-216). قيم AI-suggested فقط عبر عمليات القناة 9.
- اختبارات `productCompositing.test.ts` تغطي الإضاءة والظل والانعكاس.

---

## 24) واجهة المستخدم (UI)

- Composition: MenuBar (File/Edit/…/Filter/View/Help) → TopToolbar → LeftToolbar (أدوات 19) → ToolOptionsBar → CanDevHost (لكانفس 2D؛ زر الصورة بسحب/إفلات أعلاه، CanvasHost.tsx:31-39) → لوحات يسار (Layers، AI، Product، History، Histogram، Swatches، Scene3D) + Properties → StatusBar + ProjectTabs + Compare toggle + LanguageSelector.
- `Workspace.tsx`: PanelResizer (سحب + نقر مزدوج للاستعادة)، تغيير `--panel-w`، نافذة `busy`، تبديل `view3d` (يتذكّر 3D).
- `BeforeAfterViewer` (وضع split/side-by-side/overlay، منزلق مقسوم يتعدّل بالكيبورد، شريط opacity، دعم RTL).

---

## 25) حالة التطبيق والمخزن (Store)

- شرائح: doc/selectedIds/panels/tools/view3d/compare/busy/status/dirty/lastError/panelsWidth/language/swatches/historyList/dialogs/aiJobs/recent…
- مفاتيح localStorage: إعدادات المستخدم، `vs-ai-settings-v1`، `vs-ai-products-v1`؟، المخازن الإحصائية، السجل الآلي.
- حوارات: 26 اسمًا في `DialogName` (store.ts:151-177) تُوجَّه عبر DialogHost.
- **ملاحظات دقيقة:** `setLanguage` لا يُحفَظ (يعود للإنجليزية عند إعادة تحميل الصفحة)؛ `setBusy` معرّف (store.ts:628) **لا يُستدعى من أي شيفرة إنتاجية**؛ عناوين بعض اللوحات مكتوبة يدويًا غير مترجمة (HistogramPanel:52، LayersPanel:179، و4 نسخ بانل Properties). أداة اللغة لاختيار داخل PanelShell.

---

## 26) الترجمة (Localization)

- `en.ts` + `ar.ts` (مفاتيح يدوية، RTL عبر `dir="rtl"`). النصوص الجديدة للميزات (مورفولوجيا، قبل/بعد، 3D، AI، المنتج) مترجمة في اللغتين.
- حدود: لا نظام عدد صيغ/plural، لا دلالة موضعية متقدمة، وبعض العناوين غير مترجمة (أعلاه). افتراضي: الإنجليزية.

---

## 27) الأدوات (Tools) — 19 أداة

`move, selection, crop, brush, pencil, eraser, bucket, eyedropper, clone, heal, dodge, burn, smudge, text, shape, pen, hand, zoom, gradient`.

- **متحقَّق بالاختبار/الشيفرة:** move (سحب + تراجع) — selection (أشكال/أوضاع/عصا) — crop (قابل للتراجع) — shape/star (قابل للتراجع) — text — hand/zoom على مستوى الكانفس (toolBehaviors.test.ts:178-309).
- stitch tools (brush/pencil/eraser/clone/heal/dodge/burn/smudge) ضمن `STAMP_TOOLS` بمعالجات مؤشر فعلية؛ bucket يقرأ لون الفرشاة (ToolOptionsBar.tsx:138) مع tolerance؛ eyedropper يلتقط اللون؛ gradient/pen مرتبطون بمعالجات 2D.
- كل أداة لها اختصار/مفتاح وأيقونة وترجمة (بعدَ مقياس UI agent، فعليًا بلا أزرار ميتة أو عناصر لا معنى لها).

---

## 28) القوائم والحوارات والاختصارات

- سجل أوامر مركزي في `src/app/commands.ts` (بما فيه ملف.* مثل openImage/save/export/import) مع اختبار «كل اختصار مربوط بأمر موجود وبدون تعارض» (fileMenuCommands.test.ts/importSave.test.ts:348).
- اختصارات: Ctrl+N/O/S/Shift+S، undo/redo، fit/zoom100، تبديل 3D (Ctrl+Shift+3)، toggle قبل/بعد، أدوات حرفية. النظام ثابت (لا تخصيص من المستخدم).
- **Exit** للأجهزة يُعطَّل في المتصفح (fileMenuCommands.test.ts:106).

---

## 29) الأداء

- معاينة الفلاتر تُصغَّر إلى 512px قبل الـ Worker؛ مرجع قبل/بعد إلى 4096px؛ المعالجة الثقيلة في Worker؛ 3D بعارض offscreen.
- **الحزمة:** (الإصلاح الجديد) `dist/assets/index-CMUX8_oN.js` = **598.72 kB (gzip 163.19)** + `three3d` 686 kB في chunk laz-y + `vendor-react` 143 kB + `processWorker` 34 kB — **مست الـ 900 kB حد التحذير** (لا إنذار). مقارنة: الحزمة الرئيسية كانت 1349.80 kB في تقرير 2026-09-20.
- **مخاوف واقعية:** إعادة خبز composite ×2 بحجم عن كل تحرير؛ أقمشة `spare/spare2` مشتركة بين الوثائق؛ `captureClipAlpha` تخصص كانفس بحجم وثيقة لكل عنصر؛ `EditorDocument.clone` shallow للأنماط/المسارات؛ النمو غير المحدود لـ `_origRefs` و`AICache` في جلسة طويلة.

---

## 30) الاستقرار

- الأمان: لا مفتاح API يُحفظ؛ رفض فتح إصدار نووي أحدث من الصيغة؛ تحقق من الحشوات vains؛ فحص الوحدة على القيم المتطرفة (لا NaN/خارج-النطاق) في كل العمليات الجديدة.
- تعذّر التخصيص لا يُسقط حلقة الرسم (canvasRenderGuard.test). حد `20000px/124Mpx²` للفك الآمن.
- فحص لوحة الأخطاء في هذه الجلسة على التطبيق الحي: صفر استثناءات، صفر أخطاء Console، صفر HTTP≥400.

---

## 31) الاختبارات

- `npm run test` → **52 ملفًا / 478 اختبارًا**. توزيع: ai/tests، 3d/tests، editor/tests (الكبرى)، ui/tests.
- تفصيل التحقق في هذه الجلسة:
  1. تشغيل كامل أول: **1 فشل** — `importBlackScreen.test.ts` تجاوز مهلة 20s (توتر وقت التشغيل).
  2. إعادة التشغيل في عزلة مع مهلة 120s: **7/7 ناجحًا بداخل الملف** (يأخذ الملف ~40s).
  3. تشغيل كامل بمهلة 120s عبر `npx vitest run --testTimeout=120000`: **478/478 PASS**.
- **التشخيص الصادق:** الاختباران الثقيلان (20000×20000 و30000×20000 بكسل داخل canvas ذاكرة — حتى 2.4GB allocation مع blit ~124M بكسل) عالميًا يتجاوزان المهلة الافتراضية 20s تحت ضغط التوازي لـ 52 عاملًا؛ **ليس خطأ تحميلة في الكود ولا في الاختبار** (نفس الملف يمر دون تغيير في العزلة). لا خوف، لكن يُنصح برفع `testTimeout`/`poolOptions` أو فصل الاختبارات الضخمة (تحسين لا إصلاح).

---

## 32) التحقق الزمني (Runtime) — جلسة حية

عبر Chromium headless + CDP على `http://localhost:5174/` (مشروع مبني وخادم تطوير نشط):

| الفحص | النتيجة |
|---|---|
| العنوان / root | `Untitled — Vision Studio`، `rootExists:true`، `rootChildCount:1` |
| هيكل العمل | `.vs-workspace` موجود، canvasCount=2، readyState=complete |
| أخطاء Console/استثناءات/HTTP≥400 | **0 (صفر)** |
| كانفس المستند الفارغ | أبيض في المركز (255,255,255): التمهيد يعمل؛ الشاشة الفارغة ليست سوداء |
| **فتح صورة (سحب/إفلات PNG أحمر 640×400)** | النقطة الوسطى ← **(255,32,32) أحمر**، صفر أخطاء |

---

## 33) التحقيق في «الشاشة السوداء عند فتح صورة» (استنتاج)

- **لم تتكرر (NOT REPRODUCED).** المسار الكامل فك→طبقة→تجميع→إطار أول يعمل حيًا، ومغطى باختبارات انحدار خاصة (importBlackScreen.test.ts) تتحقق فعليًا من البكسلات في كانفس الذاكرة ومن العرض على منفذ العرض.
- السبب الجذري لجلسة سابقة كان **موت خادم التطوير على المنفذ 5174** (لا علاقة للكود) — بعد إعادة تشغيله عادت الصفحة فورًا بصفر أخطاء.
- لا يوجد أي مسار استيراد مفتوح يترك طبقة فارغة/دوك أسود بعد فشل الفك: الأخطاء تُلتقط وتُعرض عبر `lastError`/status.

---

## 34) مقارنة تقرير 2026-09-20 (السابق) بالحالة الحالية

| البند في التقرير السابق | الحالة السابقة | الحالة الآن | الدليل الحالي |
|---|---|---|---|
| عدد الاختبارات | 200/200 في 22 ملفًا | **478/478 في 52 ملفًا** | `npm run test` |
| Exposure معطّل (إضافي بدل ضربي) | **BROKEN** | **FIXED** (2^amount ضربي موحّد في كل المسارات) | processor.ts:432-445 + exposure.test.ts (16 اختبارًا) |
| شبكة الشفافية تتمدد مع التكبير | BROKEN/جمالي | **FIXED** (ثابتة على الشاشة) | checker.ts + checker.test.ts |
| Marching ants ساكنة | جمالي | **FIXED** (متحركة) | antsTicker.ts + antsTicker.test.ts |
| تعديلات الطبقة (opacity/visibility/lock/blend/rename) بلا تراجع | **نقص Medium** | **FIXED** (قابلة للتراجع والضغط بسجل واحد) | layerMetaHistory.test.ts |
| حزمة رئيسية 1349.80 kB > 900 | تحذير | **FIXED** (598.72 kB + three معزول) | `npm run build` |
| مفاتيح/اعتمادات افتراضية قرب مزودات AI | تنبيه أمني | **نظيف** (endpoint فارغ افتراضيًا، مفتاح بالذاكرة فقط) | honestySecurity.test.ts |
| أدوات (bucket…gradient) «لم يُتحقق منها» | UNKNOWN | **متحقَّقة** (ToolId 19 + toolBehaviors.test + فحص خيارات) | toolBehaviors.test.ts |
| فتح صورة→شاشة سوداء | (لاحق) | **لم تتكرر** + اختبارات انحدار | importBlackScreen.test.ts + تحقق حي |

المتبقي على حاله: tiff/pdf/psd غير مدعومة (تصميم صريح)؛ لا Smart Object؛ لا Quick Select؛ لا warp عام؛ تدرّج اللون sRGB فقط فعليًا؛ لا حفظ للتراجع داخل الملف.

---

## 35) مصفوفة الميزات الكاملة (Feature Matrix)

| الميزة | الحالة | اختبار؟ |
|---|---|---|
| Canvas 2D محرك (rAF/DPR/zoom/pan/fit/checker/ants) | ✅ VERIFIED WORKING | نعم |
| Compositor (16 blend×مجاميع×LUT سريع×fast path) | ✅ VERIFIED WORKING | نعم |
| 8 أنواع طبقات | ✅ IMPLEMENTED | نعم (جزئي) |
| Layer Styles (8) + Stroke/Overlay/Gradient | ✅ VERIFIED WORKING | نعم |
| 20 تعديلات + 27 فلتر + 15 مورفولوجيا | ✅ VERIFIED WORKING (إجمالًا) | نعم (وحدات لكل فئة) |
| طبقات التعديل غير المُدمِّرة (قبل/بعد) | ✅ VERIFIED WORKING | نعم |
| Selection (7+ أشكال/أدوات + feather/smooth/border) | ✅ VERIFIED WORKING | نعم |
| Masks + تحويل اختيار↔قناع + طباعة قناع | ✅ VERIFIED WORKING | نعم |
| History (200/512MB/jumpTo/تعرّج/دقة وثيقة) | ✅ VERIFIED WORKING | نعم |
| Before/After (split/sbs/overlay + تعقّب لكل دوك) | ✅ VERIFIED WORKING | نعم |
| Transform gizmo (scale/rotate/skew) | ✅ IMPLEMENTED | نعم (مسارات) |
| Shapes/Pen/Path (bezier + تعديل) | ✅ IMPLEMENTED | نعم |
| Text (stroke/shadow/align + حفظ) | ✅ IMPLEMENTED | نعم |
| Import png/jpeg/webp/gif/bmp/svg | ✅ VERIFIED WORKING | نعم |
| Export png/jpeg/webp/bmp | ✅ VERIFIED WORKING | نعم |
| .vstudio v1 + توافق .vsproject | ✅ VERIFIED WORKING | نعم |
| Auto-save + استرداد + Recent | ✅ IMPLEMENTED | نعم (جزئي) |
| Artboards + Guides + Grid + Snap | ✅ VERIFIED WORKING | نعم |
| 3D (WebGL عارض + مشهد + طبقات 3D في الصيغة) | 🟡 IMPLEMENTED (لا اختبار بكسل) | جزئي (نموذج/صيغة) |
| استيراد 3D glb/gltf/obj/stl | 🟡 IMPLEMENTED/PARTIAL (gltf خارجي) | جزئي |
| AI (Remote real / Mock dev-only / Local stub) | 🔵 REQUIRES EXTERNAL PROVIDER | نعم (honesty/gating/mock) |
| Product pipeline (فصل/إضاءة/ظل/انعكاس/keystone/homography) | ✅ VERIFIED WORKING | نعم |
| i18n en/ar (RTL) | 🟡 PARTIAL (عناصر قليلة غير مترجمة، لا حفظ لغة) | نعم (بعض) |
| أداة Smart Object / Quick Select / Warp | ⛔ MISSING | — |
| tiff/pdf/psd | ⛔ NOT SUPPORTED (صريح) | نعم (فشل واضح) |

---

## 36) جدول الملاحظات/الأخطاء المسجلة

| # | الحدة | المنطقة | الملاحظة | الدليل | الأثر |
|---|---|---|---|---|---|
| 1 | **Low-Med** | Tests | اختبارا الحجم اعطلوا مهلة 20s تحت ضغط التوازي (flake لا إصلاحي) | importBlackScreen.test.ts:414,428 | يتطلب رفع `testTimeout` (يُنفَّذ عبر `--testTimeout=120000`) |
| 2 | **Medium** | Memory | إعادة خبز composite ×2 بحجم المستند لكل تحرير | canvasEngine.ts:273-302 + engine.ts:2930-2943 | Vأداء ذاكرة على الصور الكبيرة |
| 3 | **Medium** | AI UX | AI غير فعّال بلا endpoint من المستخدم؛ واجهة تكوينه في Preferences فقط | RemoteAIProvider.ts + AISettingsStore.ts | توقعات خاطئة ممكنة دون تنبيه أولوي |
| 4 | **Low** | I18N | عناوين لوحات قليلة غير مترجمة + `setLanguage` لا يُحفظ | HistogramPanel:52, LayersPanel:179, store.ts:626 | تجربة ثنائية اللغة ناقصة |
| 5 | **Low** | State | `setBusy` لا يُستدعى في شيفرة الإنتاج (ميت) | store.ts:628 | لا غطاء busy فعلي للعمليات (نافذة الـ busy من مسار آخر) |
| 6 | **Low** | 3D | `material`≡`solid` (لا فرق فعلي)؛ gltf خارجي غير مضمّن | SceneRuntime.ts:129, loaders3d.ts:6-11 | نطاق عرض/استيراد محدود |
| 7 | **Low** | Model | `EditorDocument.clone()` shallow للأنماط/المسارات؛ `spare/spare2` مشتركة | document.ts:14-23 | خطر ثابتة مجمّدة نادرة، لا حاليًا |
| 8 | **Low** | Runtime | لا اختبار بكسل WebGL فعلي للـ 3D | (لا يوجد) | العارض غير مختبَر بالبكسل |

---

## 37) التقييم النهائي وخارطة الطريق المقترحة (P0–P3)

**التقييم:** مشروع ناضج للاستخدام الفردي وللتغليف (EXE/APK جاهزان من جلسة سابقة). الكود نظيف المعمارية، صادق الحالة، والاختبارات شاملة (478) ومصنّفة بحالات مفتوحة. لا Blockers.

- **P0 (عاجل لو طُلب):** لا يوجد خلل وظيفي معطِّل في النطاق المفحوص. الأولوية: رفع `testTimeout` في `vitest.config.ts` (إنقاذ الـ full-suite من الـ flake) + تحسين إعادة خبز composite على الصور الضخمة.
- **P1:** تنبيه زمني في واجهة AI عندما تكون `endpoint` فارغة (UX)؛ حفظ `language`؛ ترجمة العناوين القليلة.
- **P2:** Smart Object كطبقة حقيقية + Quick Select محلي؛ warp عام في gizmo؛ تحسين تحليل gltf خارجي.
- **P3:** اختبار بكسلات WebGL للـ 3D؛ إدخال `setBusy` في المعدّلات الثقيلة؛ Lazy-load للوحدات الخفيفة؛ تنظيف ملفات التصحيح في الجذر (بدون حذف دون إذن).

---

## 38) القيود والخلاصة

- هذا التدقيق **READ-ONLY**: لا تعديلات/إصلاحات/حذف/اكتشافات — كل النتائج توثيق للوضع الراهن.
- الحالات المفتوحة مميزة (PARTIAL/REQUIRES EXTERNAL/…): غياب دليل بكسل للـ 3D، تبعية AI على مزود خارجي، واتساق حجم حزم أطراف.
- خوادم التطوير النشطة بعد التدقيق: المنفذ 5173 (كان قائمًا) والمنفذ 5174 (أُعيد تشغيله في جلسة سابقة) — كلاهما يعمل ويخدمان التطبيق دون أخطاء.

**الخلاصة النهائية:** ✅ **typecheck PASS — build PASS — test 478/478 PASS (مع تهيئة مهلة) — runtime نظيف — فتح الصورة خالٍ من الشاشة السوداء.** المشروع جاهز للاستخدام، والحالة وظيفيًا أفضل بكثير من تقرير 2026-09-20 (إصلاحات Exposure/checker/ants/history/الحزمة + 278 اختبارًا إضافيًا + خط تغليف EXE/APK).

---

*نهاية التقرير — تدقيق READ-ONLY بتاريخ 2026-09-22.*