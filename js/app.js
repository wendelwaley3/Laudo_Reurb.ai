// ===================== Estado Global do Aplicativo =====================
const state = {
    map: null,
    layers: {
        lotes: null,
        app: null,
        poligonais: null
    },
    allLotes: [],
    nucleusSet: new Set(),
    currentNucleusFilter: 'all',
    utmOptions: { useUtm: false, zone: 23, south: true },
    generalProjectInfo: {},
    lastReportText: '',
};

// ===================== Utilidades Diversas =====================
function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function featureAreaM2(feature) {
    try {
        return turf.area(feature);
    } catch (e) {
        console.warn('Erro ao calcular área com Turf.js:', e);
        return 0;
    }
}

function ensurePolygonClosed(coords) {
    if (!coords || coords.length === 0) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push(first);
    }
    return coords;
}

// ===================== Reprojeção UTM → WGS84 =====================
function utmToLngLat(x, y, zone, south) {
    const def = `+proj=utm +zone=${Number(zone)} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
    const p = proj4(def, proj4.WGS84, [x, y]);
    return [p[0], p[1]];
}

function reprojectGeoJSONFromUTM(geojson, zone, south) {
    const converted = JSON.parse(JSON.stringify(geojson));

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;
        if (geomType === 'Point') return utmToLngLat(coords[0], coords[1], zone, south);
        if (geomType === 'LineString' || geomType === 'MultiPoint') return coords.map(c => utmToLngLat(c[0], c[1], zone, south));
        if (geomType === 'Polygon') return coords.map(r => ensurePolygonClosed(r.map(c => utmToLngLat(c[0], c[1], zone, south))));
        if (geomType === 'MultiLineString') return coords.map(l => l.map(c => utmToLngLat(c[0], c[1], zone, south)));
        if (geomType === 'MultiPolygon') return coords.map(p => p.map(r => ensurePolygonClosed(r.map(c => utmToLngLat(c[0], c[1], zone, south)))));
        return coords;
    }

    if (converted.type === 'FeatureCollection') {
        converted.features.forEach(f => f.geometry && (f.geometry.coordinates = convertGeometryCoords(f.geometry.coordinates, f.geometry.type)));
    } else if (converted.type === 'Feature') {
        converted.geometry && (converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type));
    } else {
        converted.coordinates = convertGeometryCoords(converted.coordinates, converted.type);
    }
    return converted;
}

// ===================== Inicialização do Aplicativo =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...');
    initMap();
    initNav();
    initUpload();
    initLegendToggles();
    initGeneralInfoForm();
    initMainButtons();

    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    refreshDashboard();
    fillLotesTable();
    populateNucleusFilter();
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.');
});

function initMap() {
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5);
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap' });
    osmLayer.addTo(state.map);
    const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '&copy; Esri' });
    L.control.layers({ "OpenStreetMap": osmLayer, "Esri Satélite": esriLayer }).addTo(state.map);
    state.layers.lotes = L.featureGroup().addTo(state.map);
    state.layers.app = L.featureGroup();
    state.layers.poligonais = L.featureGroup();
    state.map.invalidateSize();
}

function initNav() {
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const targetId = link.getAttribute('data-section');
            document.querySelectorAll('main section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            link.classList.add('active');
            if (targetId === 'dashboard' && state.map) state.map.invalidateSize();
        });
    });
}

function initUpload() {
    const fileInput = document.getElementById('geojsonFileInput');
    const visibleButton = document.getElementById('selectFilesVisibleButton'); // Acessa o botão pelo ID
    const fileList = document.getElementById('fileList');
    const processBtn = document.getElementById('processAndLoadBtn');
    const statusEl = document.getElementById('uploadStatus');
    const useUtmChk = document.getElementById('useUtmCheckbox');
    const utmCfg = document.getElementById('utmOptionsContainer');

    // Ação do botão visível: disparar o clique no input oculto
    if (visibleButton) {
        visibleButton.addEventListener('click', () => fileInput.click());
    } else {
        console.error("Botão 'selectFilesVisibleButton' não encontrado no HTML.");
    }

    fileInput.addEventListener('change', () => {
        fileList.innerHTML = '';
        if (fileInput.files.length > 0) {
            Array.from(fileInput.files).forEach(f => {
                const li = document.createElement('li');
                li.textContent = f.name;
                fileList.appendChild(li);
            });
        } else {
            fileList.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        }
    });

    useUtmChk.addEventListener('change', () => {
        state.utmOptions.useUtm = useUtmChk.checked;
        utmCfg.style.display = useUtmChk.checked ? 'flex' : 'none';
    });

    processBtn.addEventListener('click', async () => {
        statusEl.textContent = 'Processando...';
        statusEl.className = 'status-message info';
        
        state.layers.lotes.clearLayers();
        state.layers.app.clearLayers();
        state.layers.poligonais.clearLayers();
        state.allLotes = [];
        state.nucleusSet.clear();

        const files = Array.from(fileInput.files || []);
        if (files.length === 0) {
            statusEl.textContent = 'Nenhum arquivo para processar.';
            statusEl.className = 'status-message error';
            return;
        }

        for (const file of files) {
            try {
                let text = await file.text();
                let geojsonData = JSON.parse(text);

                if (state.utmOptions.useUtm) {
                    const zone = document.getElementById('utmZoneInput').value;
                    const south = document.getElementById('utmHemisphereSelect').value === 'S';
                    geojsonData = reprojectGeoJSONFromUTM(geojsonData, zone, south);
                }

                const lname = file.name.toLowerCase();
                if (lname.includes('lote')) {
                    state.allLotes.push(...geojsonData.features);
                    geojsonData.features.forEach(f => state.nucleusSet.add(f.properties.desc_nucleo));
                } else if (lname.includes('app')) {
                    L.geoJSON(geojsonData, { style: styleApp, onEachFeature: onEachAppFeature }).addTo(state.layers.app);
                } else {
                    L.geoJSON(geojsonData, { style: stylePoligonal, onEachFeature: onEachPoligonalFeature }).addTo(state.layers.poligonais);
                }
            } catch (e) {
                statusEl.textContent = `Erro ao processar ${file.name}: ${e.message}`;
                statusEl.className = 'status-message error';
                return;
            }
        }

        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        const allLayers = L.featureGroup([...state.layers.lotes.getLayers(), ...state.layers.app.getLayers(), ...state.layers.poligonais.getLayers()]);
        if (allLayers.getLayers().length > 0) {
            state.map.fitBounds(allLayers.getBounds(), { padding: [20, 20] });
        }

        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable();
        statusEl.textContent = 'Dados carregados com sucesso!';
        statusEl.className = 'status-message success';
    });
}

// ... (Resto das funções como styleLote, onEachLoteFeature, refreshDashboard, etc. - MANTENHA AS ÚLTIMAS VERSÕES)
// ... As funções abaixo são as versões completas do Checkpoint 5 para garantir que tudo esteja consistente ...

// ===================== Estilos e Popups das Camadas Geoespaciais =====================

// Estilo dos lotes baseado no risco
function styleLote(feature) {
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase(); // Inclui 'grau'
    let color;
    if (risco === '1' || risco.includes('baixo')) color = '#2ecc71';      
    else if (risco === '2' || risco.includes('médio')) color = '#f1c40f'; // Amarelo
    else if (risco === '3' || risco.includes('alto')) color = '#e67e22'; // Laranja
    else if (risco === '4' || risco.includes('muito alto')) color = '#c0392b'; 
    else color = '#3498db'; 

    return {
        fillColor: color,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachLoteFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A'; 

            if (key.toLowerCase() === 'area_m2' && typeof value === 'number') { 
                value = value.toLocaleString('pt-BR') + ' m²';
            }
            if ((key.toLowerCase() === 'valor' || key.toLowerCase() === 'custo de intervenção') && typeof value === 'number') { 
                value = formatBRL(value);
            }
            if (key.toLowerCase() === 'dentro_app' && typeof value === 'number') { 
                value = (value > 0) ? `Sim (${value}%)` : 'Não'; 
            }
            let displayKey = key;
            switch(key.toLowerCase()){
                case 'cod_lote': displayKey = 'Código do Lote'; break;
                case 'desc_nucleo': displayKey = 'Núcleo'; break;
                case 'tipo_uso': displayKey = 'Tipo de Uso'; break;
                case 'area_m2': displayKey = 'Área (m²)'; break;
                case 'risco': displayKey = 'Status de Risco'; break;
                case 'dentro_app': displayKey = 'Em APP'; break;
                case 'valor': displayKey = 'Custo de Intervenção'; break;
                case 'tipo_edificacao': displayKey = 'Tipo de Edificação'; break;
                case 'nm_mun': displayKey = 'Município'; break; 
                case 'nome_logradouro': displayKey = 'Logradouro'; break;
                case 'numero_postal': displayKey = 'CEP'; break;
                case 'status_risco': displayKey = 'Status Risco'; break; 
                case 'cod_area': displayKey = 'Cód. Área'; break;
                case 'grau': displayKey = 'Grau'; break;
                case 'qtde_lote': displayKey = 'Qtde. Lote(s)'; break;
                case 'intervencao': displayKey = 'Intervenção'; break;
                case 'lotes_atingidos': displayKey = 'Lotes Atingidos'; break;
            }

            popupContent += `<strong>${displayKey}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada APP
function styleApp(feature) {
    return {
        color: '#e74c3c', 
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2
    };
}

// Popup da camada APP
function onEachAppFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
        for (let key in feature.properties) {
            popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada Poligonal
function stylePoligonal(feature) {
    return {
        color: '#2ecc71', 
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2
    };
}

// Popup da camada Poligonal
async function onEachPoligonalFeature(feature, layer) {
    if (feature.properties) {
        const props = feature.properties;
        const municipioNome = props.municipio || props.nm_mun || 'Não informado'; 

        let popupContent = `<h3>Informações da Poligonal: ${municipioNome}</h3>`;
        popupContent += `<strong>Município:</strong> ${municipioNome}<br>`;
        if (props.area_m2) popupContent += `<strong>Área (m²):</strong> ${props.area_m2.toLocaleString('pt-BR')} m²<br>`;
        for (let key in props) {
            if (!['municipio', 'nm_mun', 'area_m2'].includes(key.toLowerCase())) {
                popupContent += `<strong>${key}:</strong> ${props[key]}<br>`;
            }
        }
        
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8px;">Ver informações do município</button>`;
        
        layer.bindPopup(popupContent);
    }
}

// ===================== Função simulada para buscar dados extras de cidade =====================
async function buscarInfoCidade(nomeCidade) {
    alert(`Buscando dados simulados para ${nomeCidade}...`);
    const dadosSimulados = getSimulatedMunicipioData(nomeCidade); 
    
    let info = `**Informações para ${dadosSimulados.municipio}:**\n`;
    info += `- Região: ${dadosSimulados.regiao}\n`;
    info += `- População Estimada: ${dadosSimulados.populacao}\n`;
    info += `- Área Territorial: ${dadosSimulados.area_km2} km²\n\n`;
    info += `(Estes dados são simulados. Para dados reais, um backend seria necessário.)`;

    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}


// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    const filterSelect = document.getElementById('nucleusFilter');
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    
    if (state.nucleusSet.size > 0) {
        const sortedNucleos = Array.from(state.nucleusSet).sort();
        sortedNucleos.forEach(nucleo => {
            if (nucleo && nucleo.trim() !== '') { 
                const option1 = document.createElement('option');
                option1.value = nucleo;
                option1.textContent = nucleo;
                filterSelect.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = nucleo;
                option2.textContent = nucleo;
                reportNucleosSelect.appendChild(option2);
            }
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível.</option>';
    }
}

function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => f.properties?.desc_nucleo === state.currentNucleusFilter);
}

function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) {
        state.map.setView([-15.7801, -47.9292], 5); 
        return;
    }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { state.map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch (e) {
        console.warn("Não foi possível ajustar o mapa ao filtro.", e);
    }
}

// ===================== Dashboard =====================
function refreshDashboard() {
    const feats = filteredLotes();
    const totalLotesCount = feats.length;

    let lotesRiscoAltoMuitoAlto = 0;
    let lotesAppCount = 0;
    let custoTotal = 0;
    let custoMin = Infinity;
    let custoMax = -Infinity;
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    feats.forEach(f => {
        const p = f.properties || {};
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        if (risco === '1' || risco.includes('baixo')) riskCounts['Baixo']++;
        else if (risco === '2' || risco.includes('médio')) riskCounts['Médio']++;
        else if (risco === '3' || risco.includes('alto')) riskCounts['Alto']++;
        else if (risco === '4' || risco.includes('muito alto')) riskCounts['Muito Alto']++;
        
        if (risco === '3' || risco === '4' || risco.includes('alto')) lotesRiscoAltoMuitoAlto++;
        
        const dentroApp = Number(p.dentro_app || 0);
        if (dentroApp > 0) lotesAppCount++;

        const valorCusto = Number(p.valor || 0);
        if (!isNaN(valorCusto) && valorCusto > 0) {
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal).replace('R$', '').trim();

    document.getElementById('riskLowCount').textContent = riskCounts['Baixo'];
    document.getElementById('riskMediumCount').textContent = riskCounts['Médio'];
    document.getElementById('riskHighCount').textContent = riskCounts['Alto'];
    document.getElementById('riskVeryHighCount').textContent = riskCounts['Muito Alto'];

    document.getElementById('areasIdentificadas').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('areasIntervencao').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('minCustoIntervencao').textContent = `Custo Mínimo de Intervenção: ${custoMin === Infinity ? 'N/D' : formatBRL(custoMin)}`;
    document.getElementById('maxCustoIntervencao').textContent = `Custo Máximo de Intervenção: ${custoMax === -Infinity ? 'N/D' : formatBRL(custoMax)}`;
}

// ===================== Tabela de Lotes =====================
function fillLotesTable() {
    const tbody = document.querySelector('#lotesDataTable tbody');
    const feats = filteredLotes();
    tbody.innerHTML = '';

    if (feats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    feats.forEach(f => {
        const p = f.properties || {};
        const tr = document.createElement('tr');
        const codLote = p.cod_lote || 'N/A';
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${p.desc_nucleo || 'N/A'}</td>
            <td>${p.tipo_uso || 'N/A'}</td>
            <td>${p.area_m2 ? p.area_m2.toLocaleString('pt-BR') : 'N/A'}</td>
            <td>${p.risco || p.status_risco || p.grau || 'N/A'}</td>
            <td>${(Number(p.dentro_app) > 0) ? 'Sim' : 'Não'}</td>
            <td><button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button></td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            const loteToZoom = state.allLotes.find(l => l.properties?.cod_lote == codLoteToZoom);
            if (loteToZoom) {
                document.querySelector('nav a[data-section="dashboard"]').click();
                const tempLayer = L.geoJSON(loteToZoom);
                try { state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); } catch (e) {
                    console.warn("Erro ao dar zoom no lote:", e);
                }
                state.layers.lotes.eachLayer(l => {
                    if (l.feature?.properties?.cod_lote == codLoteToZoom && l.openPopup) {
                        l.openPopup();
                    }
                });
            }
        });
    });
}

// ===================== Demais Funções (Legenda, Info Gerais, Relatório) =====================
// ... (O resto das funções como initLegendToggles, initGeneralInfoForm, gerarRelatorioIA, etc., permanecem as mesmas do Checkpoint 5) ...

// ===================== Inicialização Principal =====================
// A função `DOMContentLoaded` que chama todas as funções `init*` permanece a mesma.
