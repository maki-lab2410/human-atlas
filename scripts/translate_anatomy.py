#!/usr/bin/env python3
"""
Script translasi terminologi anatomi: Inggris → Indonesia
Menggunakan kamus kata-per-kata berbasis TERMINOLOGI MEDIS INDONESIA resmi
(Dorland's Medical Dictionary versi Indonesia, Kemenkes RI)
"""

import csv, re, sys
from pathlib import Path

# ─── KAMUS UTAMA: Kata Inggris → Indonesia (urut: lebih panjang dulu) ──────
# Berdasarkan: Terminologi Anatomi Indonesia (FKUI), Kamus Kedokteran Dorland Indonesia

TERM_MAP = {
    # ── Penunjuk LATERALITAS ─────────────────────────────────────────────
    # PENTING: Frasa "of right/left" dulu, baru "right/left" berdiri sendiri
    " of right ":           " kanan ",
    " of left ":            " kiri ",
    "right of ":            "kanan dari ",
    "left of ":             "kiri dari ",

    # ── JENIS STRUKTUR UTAMA ─────────────────────────────────────────────
    "sternocostal part":        "bagian sternokoastal",
    "clavicular part":          "bagian klavikular",
    "abdominal part":           "bagian abdominal",
    "thoracic part":            "bagian torakal",
    "cervical part":            "bagian servikal",
    "lumbar part":              "bagian lumbal",
    "sacral part":              "bagian sakral",
    "pelvic part":              "bagian pelvik",
    "costal part":              "bagian kostal",
    "ascending part":           "bagian asendens",
    "descending part":          "bagian desendens",
    "horizontal part":          "bagian horizontal",
    "deep part":                "bagian dalam",
    "superficial part":         "bagian superfisial",
    "anterior part":            "bagian anterior",
    "posterior part":           "bagian posterior",
    "medial part":              "bagian medial",
    "lateral part":             "bagian lateral",
    "superior part":            "bagian superior",
    "inferior part":            "bagian inferior",
    "proximal part":            "bagian proksimal",
    "distal part":              "bagian distal",
    "internal part":            "bagian dalam",
    "external part":            "bagian luar",
    "orbital part":             "bagian orbital",
    "nasal part":               "bagian nasal",
    "spinal part":              "bagian spinalis",
    "cranial part":             "bagian kranial",
    "caudal part":              "bagian kaudal",
    "dorsal part":              "bagian dorsal",
    "ventral part":             "bagian ventral",
    " part of ":                " bagian dari ",
    " part":                    " bagian",

    # ── OTOT (Muscles) ───────────────────────────────────────────────────
    "pectoralis major":         "pektoralis mayor",
    "pectoralis minor":         "pektoralis minor",
    "pectoralis":               "pektoralis",
    "trapezius":                "trapezius",
    "deltoid":                  "deltoid",
    "biceps brachii":           "biseps brakii",
    "triceps brachii":          "triseps brakii",
    "brachialis":               "brakialis",
    "brachioradialis":          "brakioradialis",
    "coracobrachialis":         "korakobrakialis",
    "latissimus dorsi":         "latisimus dorsi",
    "rhomboid major":           "romboid mayor",
    "rhomboid minor":           "romboid minor",
    "rhomboid":                 "romboid",
    "serratus anterior":        "serratus anterior",
    "subscapularis":            "subskapularis",
    "supraspinatus":            "supraspinosus",
    "infraspinatus":            "infraspinosus",
    "teres major":              "teres mayor",
    "teres minor":              "teres minor",
    "teres":                    "teres",
    "anconeus":                 "ankoneus",
    "pronator teres":           "pronator teres",
    "pronator quadratus":       "pronator kuadratus",
    "supinator":                "supinator",
    "flexor carpi radialis":    "fleksor karpi radialis",
    "flexor carpi ulnaris":     "fleksor karpi ulnaris",
    "flexor digitorum superficialis": "fleksor digitorum superfisialis",
    "flexor digitorum profundus":    "fleksor digitorum profundus",
    "flexor pollicis longus":   "fleksor polisis longus",
    "flexor pollicis brevis":   "fleksor polisis brevis",
    "extensor carpi radialis longus": "ekstensor karpi radialis longus",
    "extensor carpi radialis brevis": "ekstensor karpi radialis brevis",
    "extensor carpi ulnaris":   "ekstensor karpi ulnaris",
    "extensor digitorum":       "ekstensor digitorum",
    "extensor digiti minimi":   "ekstensor digiti minimi",
    "extensor indicis":         "ekstensor indisis",
    "extensor pollicis longus": "ekstensor polisis longus",
    "extensor pollicis brevis": "ekstensor polisis brevis",
    "abductor pollicis longus": "abduktor polisis longus",
    "abductor pollicis brevis": "abduktor polisis brevis",
    "adductor pollicis":        "adduktor polisis",
    "opponens pollicis":        "oponen polisis",
    "abductor digiti minimi":   "abduktor digiti minimi",
    "opponens digiti minimi":   "oponen digiti minimi",
    "flexor digiti minimi brevis": "fleksor digiti minimi brevis",
    "lumbricals":               "lumbrikalis",
    "lumbrical":                "lumbrikalis",
    "dorsal interosseous":      "interoseus dorsal",
    "palmar interosseous":      "interoseus palmar",
    "interosseous":             "interoseus",
    "sternocleidomastoid":      "sternokleidomastoid",
    "sternohyoid":              "sternohioid",
    "sternothyroid":            "sternoiroid",
    "thyrohyoid":               "tirohioid",
    "omohyoid":                 "omohioid",
    "mylohyoid":                "milohioid",
    "digastric":                "digastrikus",
    "stylohyoid":               "stilohioid",
    "geniohyoid":               "geniohioid",
    "masseter":                 "maseter",
    "temporalis":               "temporalis",
    "pterygoid":                "pterigoid",
    "buccinator":               "bukinator",
    "orbicularis oris":         "orbicularis oris",
    "orbicularis oculi":        "orbicularis okuli",
    "levator labii":            "levator labii",
    "zygomaticus":              "zigomatikus",
    "frontalis":                "frontalis",
    "occipitalis":              "oksipitalis",
    "platysma":                 "platisma",
    "scalene":                  "skalenus",
    "scalenus":                 "skalenus",
    "longus colli":             "longus kolli",
    "longus capitis":           "longus kapitis",
    "splenius capitis":         "splenium kapitis",
    "splenius cervicis":        "splenium servisis",
    "semispinalis":             "semispinalis",
    "multifidus":               "multifidus",
    "rotatores":                "rotator",
    "interspinales":            "interspinalis",
    "intertransversarii":       "intertransversarius",
    "erector spinae":           "ereksi tulang belakang",
    "iliocostalis":             "iliokostalis",
    "longissimus":              "longissimus",
    "spinalis":                 "spinalis",
    "quadratus lumborum":       "kuadratus lumborum",
    "psoas major":              "psoas mayor",
    "psoas minor":              "psoas minor",
    "psoas":                    "psoas",
    "iliacus":                  "iliakus",
    "iliopsoas":                "iliopsoas",
    "gluteus maximus":          "gluteus maksimus",
    "gluteus medius":           "gluteus medius",
    "gluteus minimus":          "gluteus minimus",
    "gluteus":                  "gluteus",
    "piriformis":               "piriformis",
    "obturator internus":       "obturator internus",
    "obturator externus":       "obturator eksternus",
    "obturator":                "obturator",
    "gemellus superior":        "gemellus superior",
    "gemellus inferior":        "gemellus inferior",
    "gemellus":                 "gemellus",
    "quadratus femoris":        "kuadratus femoris",
    "tensor fasciae latae":     "tensor fasiae latae",
    "sartorius":                "sartorius",
    "rectus femoris":           "rektus femoris",
    "vastus lateralis":         "vastus lateralis",
    "vastus medialis":          "vastus medialis",
    "vastus intermedius":       "vastus intermedius",
    "quadriceps femoris":       "kuadriseps femoris",
    "adductor longus":          "adduktor longus",
    "adductor brevis":          "adduktor brevis",
    "adductor magnus":          "adduktor magnus",
    "adductor":                 "adduktor",
    "gracilis":                 "grasilis",
    "pectineus":                "pektineus",
    "biceps femoris":           "biseps femoris",
    "semitendinosus":           "semitendiosus",
    "semimembranosus":          "semimembranosus",
    "hamstring":                "hamstring",
    "gastrocnemius":            "gastroknemius",
    "soleus":                   "soleus",
    "plantaris":                "plantaris",
    "popliteus":                "popliteus",
    "tibialis anterior":        "tibialis anterior",
    "tibialis posterior":       "tibialis posterior",
    "tibialis":                 "tibialis",
    "peroneus longus":          "peroneus longus",
    "peroneus brevis":          "peroneus brevis",
    "fibularis longus":         "fibularis longus",
    "fibularis brevis":         "fibularis brevis",
    "extensor hallucis longus": "ekstensor halukis longus",
    "extensor hallucis brevis": "ekstensor halukis brevis",
    "extensor digitorum longus": "ekstensor digitorum longus",
    "extensor digitorum brevis": "ekstensor digitorum brevis",
    "flexor hallucis longus":   "fleksor halukis longus",
    "flexor hallucis brevis":   "fleksor halukis brevis",
    "flexor digitorum longus":  "fleksor digitorum longus",
    "abductor hallucis":        "abduktor halukis",
    "adductor hallucis":        "adduktor halukis",
    "abductor digiti":          "abduktor digiti",
    "intercostal":              "interkostal",
    "diaphragm":                "diafragma",
    "transversus abdominis":    "transversus abdominis",
    "internal oblique":         "oblik internal",
    "external oblique":         "oblik eksternal",
    "rectus abdominis":         "rektus abdominis",
    "pyramidalis":              "piramidalis",
    "cremaster":                "kremaster",
    "levator ani":              "levator ani",
    "coccygeus":                "koksigeus",
    "ischiocavernosus":         "iskhiokavernosus",
    "bulbospongiosus":          "bulbospongiosus",
    "transverse perineal":      "perineal transversal",
    "sphincter":                "sfingter",
    "muscle":                   "otot",
    "muscles":                  "otot-otot",

    # ── TULANG (Bones) ───────────────────────────────────────────────────
    "skull":                    "tengkorak",
    "cranium":                  "kranium",
    "mandible":                 "mandibula",
    "maxilla":                  "maksila",
    "frontal bone":             "tulang frontal",
    "parietal bone":            "tulang parietal",
    "occipital bone":           "tulang oksipital",
    "temporal bone":            "tulang temporal",
    "sphenoid bone":            "tulang sfenoid",
    "ethmoid bone":             "tulang etmoid",
    "zygomatic bone":           "tulang zigomatik",
    "nasal bone":               "tulang nasal",
    "lacrimal bone":            "tulang lakrimal",
    "palatine bone":            "tulang palatin",
    "vomer":                    "vomer",
    "hyoid bone":               "tulang hioid",
    "hyoid":                    "hioid",
    "clavicle":                 "tulang selangka",
    "scapula":                  "tulang belikat",
    "humerus":                  "humerus",
    "radius":                   "radius",
    "ulna":                     "ulna",
    "carpal":                   "karpal",
    "carpus":                   "karpus",
    "metacarpal":               "metakarpal",
    "metacarpus":               "metakarpus",
    "phalanx":                  "falang",
    "phalanges":                "falang",
    "sternum":                  "tulang dada",
    "rib":                      "tulang rusuk",
    "ribs":                     "tulang rusuk",
    "costal cartilage":         "tulang rawan iga",
    "vertebral column":         "kolom vertebral",
    "vertebra":                 "vertebra",
    "vertebrae":                "vertebra",
    "cervical vertebra":        "vertebra servikal",
    "thoracic vertebra":        "vertebra torakal",
    "lumbar vertebra":          "vertebra lumbal",
    "sacrum":                   "sakrum",
    "coccyx":                   "tulang ekor",
    "pelvis":                   "pelvis",
    "ilium":                    "ilium",
    "ischium":                  "iskium",
    "pubis":                    "pubis",
    "hip bone":                 "tulang panggul",
    "acetabulum":               "asetabulum",
    "femur":                    "femur",
    "patella":                  "patela",
    "tibia":                    "tibia",
    "fibula":                   "fibula",
    "tarsal":                   "tarsal",
    "tarsus":                   "tarsus",
    "calcaneus":                "kalkaneus",
    "talus":                    "talus",
    "navicular":                "navikular",
    "cuboid":                   "kuboid",
    "cuneiform":                "kuneiform",
    "metatarsal":               "metatarsal",
    "metatarsus":               "metatarsus",
    "bone":                     "tulang",
    "bones":                    "tulang-tulang",
    "ossicle":                  "osikel",
    "epicondyle":               "epikondil",
    "condyle":                  "kondil",
    "process":                  "prosesus",
    "tuberosity":               "tuberositas",
    "tubercle":                 "tuberkulum",
    "spine":                    "spina",
    "foramen":                  "foramen",
    "fossa":                    "fosa",
    "sulcus":                   "sulkus",
    "groove":                   "alur",
    "head of":                  "kepala",
    "neck of":                  "leher",
    "shaft of":                 "batang",
    "body of":                  "badan",

    # ── PEMBULUH DARAH (Blood vessels) ──────────────────────────────────
    "aorta":                    "aorta",
    "aortic arch":              "arkus aorta",
    "ascending aorta":          "aorta asendens",
    "descending aorta":         "aorta desendens",
    "thoracic aorta":           "aorta torakal",
    "abdominal aorta":          "aorta abdominal",
    "celiac trunk":             "trunkus seliakus",
    "superior mesenteric artery": "arteri mesenterika superior",
    "inferior mesenteric artery": "arteri mesenterika inferior",
    "renal artery":             "arteri renalis",
    "renal vein":               "vena renalis",
    "iliac artery":             "arteri iliaka",
    "iliac vein":               "vena iliaka",
    "femoral artery":           "arteri femoralis",
    "femoral vein":             "vena femoralis",
    "popliteal artery":         "arteri poplitea",
    "popliteal vein":           "vena poplitea",
    "tibial artery":            "arteri tibialis",
    "tibial vein":              "vena tibialis",
    "carotid artery":           "arteri karotis",
    "carotid":                  "karotis",
    "subclavian artery":        "arteri subklavia",
    "subclavian vein":          "vena subklavia",
    "subclavian":               "subklavia",
    "axillary artery":          "arteri aksilaris",
    "axillary vein":            "vena aksilaris",
    "axillary":                 "aksilaris",
    "brachial artery":          "arteri brakialis",
    "brachial vein":            "vena brakialis",
    "radial artery":            "arteri radialis",
    "ulnar artery":             "arteri ulnaris",
    "coronary artery":          "arteri koroner",
    "coronary":                 "koroner",
    "pulmonary artery":         "arteri pulmonalis",
    "pulmonary vein":           "vena pulmonalis",
    "pulmonary trunk":          "trunkus pulmonalis",
    "hepatic artery":           "arteri hepatika",
    "hepatic vein":             "vena hepatika",
    "hepatic":                  "hepatika",
    "portal vein":              "vena porta",
    "splenic artery":           "arteri lienalis",
    "splenic vein":             "vena lienalis",
    "gastric artery":           "arteri gastrika",
    "superior vena cava":       "vena kava superior",
    "inferior vena cava":       "vena kava inferior",
    "vena cava":                "vena kava",
    "jugular vein":             "vena jugularis",
    "jugular":                  "jugularis",
    "saphenous vein":           "vena safena",
    "saphenous":                "safena",
    "cephalic vein":            "vena sefalika",
    "basilic vein":             "vena basilika",
    "azygos vein":              "vena azigos",
    "azygos":                   "azigos",
    "hemiazygos":               "hemi-azigos",
    "intercostal artery":       "arteri interkostal",
    "intercostal vein":         "vena interkostal",
    "phrenic artery":           "arteri frenika",
    "phrenic vein":             "vena frenika",
    "lumbar artery":            "arteri lumbal",
    "lumbar vein":              "vena lumbal",
    "obturator artery":         "arteri obturator",
    "gluteal artery":           "arteri gluteal",
    "pudendal artery":          "arteri pudendal",
    "artery":                   "arteri",
    "arteries":                 "arteri",
    "vein":                     "vena",
    "veins":                    "vena",
    "vessel":                   "pembuluh darah",
    "vessels":                  "pembuluh darah",
    "capillary":                "kapiler",
    "anastomosis":              "anastomosis",

    # ── SARAF (Nerves) ───────────────────────────────────────────────────
    "spinal cord":              "sumsum tulang belakang",
    "spinal nerve":             "saraf spinal",
    "cranial nerve":            "saraf kranial",
    "brachial plexus":          "pleksus brakialis",
    "lumbar plexus":            "pleksus lumbal",
    "sacral plexus":            "pleksus sakral",
    "sciatic nerve":            "saraf iskhiadikus",
    "femoral nerve":            "saraf femoralis",
    "obturator nerve":          "saraf obturator",
    "tibial nerve":             "saraf tibialis",
    "common fibular nerve":     "saraf fibularis komunis",
    "common peroneal nerve":    "saraf peroneus komunis",
    "radial nerve":             "saraf radialis",
    "median nerve":             "saraf medianus",
    "ulnar nerve":              "saraf ulnaris",
    "musculocutaneous nerve":   "saraf muskulokutaneus",
    "axillary nerve":           "saraf aksilaris",
    "vagus nerve":              "saraf vagus",
    "phrenic nerve":            "saraf frenikus",
    "intercostal nerve":        "saraf interkostal",
    "trigeminal nerve":         "saraf trigeminus",
    "facial nerve":             "saraf fasialis",
    "glossopharyngeal":         "glosofaringeal",
    "hypoglossal":              "hipoglosal",
    "optic nerve":              "saraf optikus",
    "olfactory nerve":          "saraf olfaktorius",
    "oculomotor nerve":         "saraf okulomotor",
    "trochlear nerve":          "saraf troklearis",
    "abducens nerve":           "saraf abdusens",
    "vestibulocochlear":        "vestibulokoklear",
    "accessory nerve":          "saraf aksesorius",
    "sympathetic":              "simpatis",
    "parasympathetic":          "parasimpatis",
    "ganglion":                 "ganglion",
    "plexus":                   "pleksus",
    "nerve":                    "saraf",
    "nerves":                   "saraf-saraf",
    "nervous":                  "saraf",

    # ── ORGAN INTERNAL ───────────────────────────────────────────────────
    "heart":                    "jantung",
    "pericardium":              "perikardium",
    "atrium":                   "atrium",
    "ventricle":                "ventrikel",
    "atrioventricular":         "atrioventrikular",
    "mitral valve":             "katup mitral",
    "aortic valve":             "katup aorta",
    "pulmonary valve":          "katup pulmonal",
    "tricuspid valve":          "katup trikuspid",
    "lung":                     "paru-paru",
    "lungs":                    "paru-paru",
    "bronchus":                 "bronkus",
    "bronchi":                  "bronki",
    "trachea":                  "trakea",
    "larynx":                   "laring",
    "pharynx":                  "faring",
    "esophagus":                "esofagus",
    "stomach":                  "lambung",
    "duodenum":                 "duodenum",
    "jejunum":                  "jejunum",
    "ileum":                    "ileum",
    "cecum":                    "sekum",
    "appendix":                 "apendiks",
    "colon":                    "kolon",
    "sigmoid colon":            "kolon sigmoid",
    "rectum":                   "rektum",
    "anal canal":               "kanal anal",
    "liver":                    "hati",
    "gallbladder":              "kandung empedu",
    "bile duct":                "saluran empedu",
    "pancreas":                 "pankreas",
    "spleen":                   "limpa",
    "kidney":                   "ginjal",
    "ureter":                   "ureter",
    "urinary bladder":          "kandung kemih",
    "urethra":                  "uretra",
    "prostate":                 "prostat",
    "testis":                   "testis",
    "epididymis":               "epididimis",
    "ovary":                    "ovarium",
    "uterus":                   "uterus",
    "uterine tube":             "tuba uterin",
    "vagina":                   "vagina",
    "thyroid gland":            "kelenjar tiroid",
    "thyroid":                  "tiroid",
    "parathyroid":              "paratiroid",
    "adrenal gland":            "kelenjar adrenal",
    "adrenal":                  "adrenal",
    "thymus":                   "timus",
    "brain":                    "otak",
    "cerebrum":                 "serebrum",
    "cerebellum":               "serebelum",
    "brainstem":                "batang otak",
    "medulla oblongata":        "medula oblongata",
    "pons":                     "pons",
    "midbrain":                 "otak tengah",
    "hypothalamus":             "hipotalamus",
    "thalamus":                 "talamus",
    "hippocampus":              "hipokampus",
    "amygdala":                 "amigdala",
    "corpus callosum":          "korpus kalosum",
    "meninges":                 "meninges",
    "dura mater":               "dura mater",
    "arachnoid":                "arakhnoid",
    "pia mater":                "pia mater",
    "eye":                      "mata",
    "ear":                      "telinga",
    "nose":                     "hidung",
    "tongue":                   "lidah",
    "tooth":                    "gigi",
    "teeth":                    "gigi",
    "salivary gland":           "kelenjar saliva",
    "parotid":                  "parotid",
    "skin":                     "kulit",
    "lymph node":               "kelenjar getah bening",
    "lymphatic":                "limfatik",
    "tonsil":                   "tonsil",
    "thymus":                   "timus",

    # ── DESKRIPTOR POSISI & ARAH ─────────────────────────────────────────
    "anterior":                 "anterior",
    "posterior":                "posterior",
    "superior":                 "superior",
    "inferior":                 "inferior",
    "medial":                   "medial",
    "lateral":                  "lateral",
    "internal":                 "internal",
    "external":                 "eksternal",
    "proximal":                 "proksimal",
    "distal":                   "distal",
    "deep":                     "dalam",
    "superficial":              "superfisial",
    "dorsal":                   "dorsal",
    "ventral":                  "ventral",
    "cranial":                  "kranial",
    "caudal":                   "kaudal",
    "ipsilateral":              "ipsilateral",
    "contralateral":            "kontralateral",
    "bilateral":                "bilateral",

    # ── DESKRIPTOR UKURAN ────────────────────────────────────────────────
    "major":                    "mayor",
    "minor":                    "minor",
    "magnus":                   "magnus",
    "maximus":                  "maksimus",
    "minimus":                  "minimus",
    "medius":                   "medius",
    "longus":                   "longus",
    "brevis":                   "brevis",
    "long":                     "panjang",
    "short":                    "pendek",
    "great":                    "besar",
    "small":                    "kecil",
    "large":                    "besar",
    "greater":                  "mayor",
    "lesser":                   "minor",

    # ── KEPALA OTOT ─────────────────────────────────────────────────────
    "medial head of":           "kaput medial",
    "lateral head of":          "kaput lateral",
    "long head of":             "kaput longum",
    "short head of":            "kaput brevis",
    "head of":                  "kaput",

    # ── JARINGAN & LAIN-LAIN ────────────────────────────────────────────
    "common fibular nerve":     "saraf fibularis komunis",
    "common peroneal nerve":    "saraf peroneus komunis",
    "common iliac artery":      "arteri iliaka komunis",
    "common iliac vein":        "vena iliaka komunis",
    "common carotid artery":    "arteri karotis komunis",
    "common fibular":           "fibularis komunis",
    "common peroneal":          "peroneus komunis",
    "common iliac":             "iliaka komunis",
    "tendon":                   "tendon",
    "ligament":                 "ligamen",
    "cartilage":                "tulang rawan",
    "joint":                    "sendi",
    "fascia":                   "fasia",
    "bursa":                    "bursa",
    "aponeurosis":              "aponeurosis",
    "membrane":                 "membran",
    "capsule":                  "kapsul",
    "cavity":                   "rongga",
    "sinus":                    "sinus",
    "duct":                     "duktus",
    "gland":                    "kelenjar",
    "glands":                   "kelenjar",
    "lobe":                     "lobus",
    "segment":                  "segmen",
    "region":                   "regio",
    "wall":                     "dinding",
    "floor":                    "lantai",
    "roof":                     "atap",
    "mesentery":                "mesenterium",
    "peritoneum":               "peritoneum",
    "pleura":                   "pleura",
    "pericardium":              "perikardium",
    "synovial":                 "sinovial",
    "lymphatic vessel":         "pembuluh limfatik",

    # ── DAERAH TUBUH ────────────────────────────────────────────────────
    "upper limb":               "ekstremitas atas",
    "lower limb":               "ekstremitas bawah",
    "upper extremity":          "ekstremitas atas",
    "lower extremity":          "ekstremitas bawah",
    "thorax":                   "toraks",
    "thoracic":                 "torakal",
    "abdomen":                  "abdomen",
    "abdominal":                "abdominal",
    "perineum":                 "perineum",
    "axilla":                   "aksila",
    "shoulder":                 "bahu",
    "arm":                      "lengan atas",
    "forearm":                  "lengan bawah",
    "wrist":                    "pergelangan tangan",
    "hand":                     "tangan",
    "finger":                   "jari tangan",
    "thumb":                    "ibu jari",
    "thigh":                    "paha",
    "leg":                      "tungkai bawah",
    "knee":                     "lutut",
    "ankle":                    "pergelangan kaki",
    "foot":                     "kaki",
    "toe":                      "jari kaki",
    "neck":                     "leher",
    "head":                     "kepala",
    "back":                     "punggung",
    "chest":                    "dada",
    "groin":                    "lipat paha",
    "gluteal":                  "gluteal",
    "inguinal":                 "inguinal",
    "popliteal":                "poplitea",
}

# ─── KAMUS LATERALITAS (diproses SETELAH kamus utama) ────────────────────────
LATERALITY_MAP = {
    r'\bkanan\b\s+': '',   # akan diposisikan ulang di akhir
    r'\bkiri\b\s+': '',
}

# Kata depan lateralitas (dalam Inggris) → diproses terpisah
SIDE_WORDS = {
    'right': 'kanan',
    'left': 'kiri',
    'bilateral': 'bilateral',
}

def translate_english_to_indonesian(english_name: str) -> str:
    """Translasi nama anatomi Inggris ke Indonesia menggunakan kamus term."""
    text = english_name.lower().strip()

    # 1. Deteksi lateralitas di awal atau setelah "of"
    side = None
    # Pola: "right X", "left X", "X of right Y", "X of left Y"
    side_match = re.match(r'^(right|left)\s+(.+)$', text)
    of_side_match = re.search(r'\bof\s+(right|left)\s+', text)

    if of_side_match:
        side = SIDE_WORDS[of_side_match.group(1)]
        text = re.sub(r'\bof\s+(right|left)\s+', ' ', text).strip()
    elif side_match:
        side = SIDE_WORDS[side_match.group(1)]
        text = side_match.group(2)

    # 2. Terapkan kamus term (panjang dulu)
    sorted_terms = sorted(TERM_MAP.keys(), key=len, reverse=True)
    for term in sorted_terms:
        if term.strip() in text:
            text = text.replace(term.strip(), TERM_MAP[term].strip())

    # 3. Tambahkan lateralitas di akhir (pola Indonesia: "Otot X kanan")
    if side:
        text = f"{text} {side}"

    # 4. Bersihkan spasi ganda
    text = re.sub(r'\s+', ' ', text).strip()

    # 5. Kapitalkan huruf pertama
    return text.capitalize()


def process_csv(input_path: str, output_path: str, mode: str = "fill_empty"):
    """
    mode:
      'fill_empty'    → hanya isi yang kosong
      'fix_identical' → isi yang sama persis dgn nama Inggris
      'all'           → isi semua yang kosong ATAU sama dgn Inggris
    """
    with open(input_path, encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    changed = 0
    skipped = 0

    for row in rows:
        eng = row['Original_English_Name'].strip()
        indo = row['Indonesian_Name'].strip()
        latin = row['Medical_Latin_Name'].strip()

        needs_fill = False
        if mode in ('fill_empty', 'all') and not indo:
            needs_fill = True
        if mode in ('fix_identical', 'all') and indo.lower() == eng.lower():
            needs_fill = True

        if needs_fill:
            translated = translate_english_to_indonesian(eng)
            # Hanya update jika hasil terjemahan berbeda dari Inggris
            if translated.lower() != eng.lower():
                row['Indonesian_Name'] = translated
                changed += 1
            else:
                skipped += 1

    with open(output_path, encoding='utf-8', newline='') as f_check:
        pass  # just check file exists

    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Selesai! {changed} entri diisi, {skipped} dilewati (terjemahan = Inggris)")
    return changed, skipped


if __name__ == "__main__":
    base = Path("/Users/ari/Downloads/human-atlas-main/public")
    inp  = base / "anatomy_template_FINAL.csv"
    out  = base / "anatomy_template_FINAL.csv"  # overwrite in place

    # Hitung dulu sebelum proses
    with open(inp, encoding='utf-8') as f:
        rows_preview = list(csv.DictReader(f))
    empty_before = sum(1 for r in rows_preview if not r['Indonesian_Name'].strip())
    same_before  = sum(1 for r in rows_preview
                       if r['Indonesian_Name'].strip().lower() == r['Original_English_Name'].strip().lower()
                       and r['Indonesian_Name'].strip())

    print(f"📊 Sebelum: {empty_before} kosong, {same_before} sama dengan Inggris")
    print("🔄 Memproses translasi...")

    process_csv(str(inp), str(out), mode='all')

    # Verifikasi sesudah
    with open(out, encoding='utf-8') as f:
        rows_after = list(csv.DictReader(f))
    empty_after = sum(1 for r in rows_after if not r['Indonesian_Name'].strip())
    same_after  = sum(1 for r in rows_after
                      if r['Indonesian_Name'].strip().lower() == r['Original_English_Name'].strip().lower()
                      and r['Indonesian_Name'].strip())

    print(f"📊 Sesudah: {empty_after} masih kosong, {same_after} masih sama dengan Inggris")
    print(f"\nContoh 10 hasil translasi:")
    shown = 0
    for r in rows_after:
        if shown >= 10: break
        en = r['Original_English_Name']
        id_ = r['Indonesian_Name']
        if en.lower() != id_.lower() and id_:
            print(f"  EN: {en[:55]:55s} → ID: {id_}")
            shown += 1
