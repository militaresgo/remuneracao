
// v175 — Contador de Acessos (Firebase RTDB)
(function(){
  var counterEl = document.getElementById('accessCounter');
  var valueEl   = document.getElementById('accessCount');
  function hide(){ if (counterEl) counterEl.hidden = true; }
  function show(){ if (counterEl) counterEl.hidden = false; }
  function fmt(n){ try{ return new Intl.NumberFormat('pt-BR').format(n); }catch(_){ return String(n); } }

  if (!counterEl || !valueEl){ return; }

  try{
    if (!window.firebase || !firebase.initializeApp){ hide(); return; }

    // ►► PREENCHER COM SEU PROJETO FIREBASE ◄◄
    var firebaseConfig = window.FIREBASE_CFG || {
  apiKey:        "AIzaSyD_9fTSTKecWK-nnjl9BrlOzuJkNIzHsrA",
  authDomain:    "militaresgo.firebaseapp.com",
  databaseURL:   "https://militaresgo-default-rtdb.firebaseio.com",
  projectId:     "militaresgo",
  storageBucket: "militaresgo.firebasestorage.app",
  messagingSenderId: "583956560315",
  appId:         "1:583956560315:web:b5633663b145eb3d61ac9e"
};

    if (firebase.apps && !firebase.apps.length){ firebase.initializeApp(firebaseConfig); }
    var db = firebase.database();

    // Chave global do site (pode mudar para por-página se desejar)
    var ref = db.ref('analytics/acessos/remuneracao_total');

    ref.transaction(function(curr){ return (curr||0) + 1; }, function(err, committed, snap){
      if (err || !committed || !snap){ hide(); return; }
      var v = snap.val();
      if (typeof v === 'number'){ valueEl.textContent = fmt(v); show(); }
    }, false);

    ref.on('value', function(s){
      var v = s && s.val();
      if (typeof v === 'number'){ valueEl.textContent = fmt(v); show(); }
    }, function(){ hide(); });

    setTimeout(function(){ if (valueEl.textContent === '—') hide(); }, 3000);

  }catch(e){
    hide();
  }
})();
