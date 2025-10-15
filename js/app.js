// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; 
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 
let filteredLotesFeatures = []; 

const DEFAULT_CENTER = [-15.7801, -47.9297]; // Centro padrão (Brasília)

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

// =========================================================================
// ATUALIZAÇÃO PROFISSIONAL: CONFIGURAÇÃO PADRONIZADA DE RISCO (1 a 4 + Nulo)
// =========================================================================
const RISK_GRADES_CONFIG = {
    // PADRÃO SOLICITADO
    '1': { color: '#2ecc71', name: 'Grau 1 (Risco Baixo - Verde)', toggle: true, count: 0 },  // Verde
    '2': { color: '#f1c40f', name: 'Grau 2 (Risco Médio - Amarelo)', toggle: true, count: 0 }, // Amarelo
    '3': { color: '#e67e22', name: 'Grau 3 (Risco Elevado - Laranja)', toggle: true, count: 0 }, // Laranja (Alto)
    '4': { color: '#e74c3c', name: 'Grau 4 (Risco Muito Alto - Vermelho)', toggle: true, count: 0 },  // Vermelho
    
    // TRATAMENTO DE NULOS/AUSENTES
    'NA': { color: 'transparent', name: 'Sem Risco Atribuído (NULO)', toggle: true, count: 0 } // Estilo transparente
};

// ----------------------------------------------------
// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    
    if (map) map.remove(); 

    map = L.map('mapid').setView(DEFAULT_CENTER, 4);

    const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NGA, and the GIS User Community',
        maxZoom: 19
    }).addTo(map);

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community',
        maxZoom: 19
    });

    const baseLayers = {
        "Mapa Base (Ruas - ESRI)": esriStreet,
        "Satélite (ESRI)": esriSatellite
    };

    L.control.layers(baseLayers, null, { collapsed: false }).addTo(map);

    map.invalidateSize(); 

    updateLayerControl();
}


// ----------------------------------------------------
// 2. Lógica de Navegação/Abas 
function setupTabNavigation() {
    console.log('setupTabNavigation: Configurando navegação por abas.');
    const navLinks = document.querySelectorAll('header nav a');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');

            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // CORREÇÃO ESSENCIAL: Corrige o mapa cinza ao trocar de aba
            if (targetSectionId === 'dashboard' && map) {
                setTimeout(() => {
                    map.invalidateSize();
                    if (lotesLayer && lotesLayer.getBounds().isValid()) {
                         map.fitBounds(lotesLayer.getBounds());
                    } else {
                        map.setView(DEFAULT_CENTER, 4);
                    }
                }, 50); 
            }
        });
    });

    // Garante que a primeira aba (Dashboard) esteja ativa ao carregar
    const dashboardSection = document.getElementById('dashboard');
    const dashboardLink = document.querySelector('a[data-section="dashboard"]');
    
    if (dashboardSection && dashboardLink) {
        dashboardSection.classList.add('active');
        dashboardLink.classList.add('active');
    }
}


// ----------------------------------------------------
// INICIALIZAÇÃO PRINCIPAL 
window.addEventListener('load', () => {
    console.log('Window Load: Inicializando GeoLaudo.AI');
    setupTabNavigation(); 
    initMap(); 
    
    document.getElementById('exportReportBtn').style.display = 'none';

    if (allLotesGeoJSON.features.length > 0) {
        updateSummaryCards(allLotesGeoJSON.features);
        updateNucleoFilter(allLotesGeoJSON.features);
        updateRiskControl(allLotesGeoJSON.features);
        applyFilters();
    }
});


// ----------------------------------------------------
// 3. Lógica de Estilo e Camadas

function getStyleForRisco(feature, type = 'lotes') {
    if (type === 'lotes') {
        // TRATAMENTO DE NULOS: Garante que GRAU_RISCO seja tratado como 'NA' se for null/undefined/0
        const riskProperty = feature.properties.GRAU_RISCO;
        const riskGrade = (riskProperty === null || riskProperty === undefined || riskProperty === 0) 
                          ? 'NA' 
                          : String(riskProperty);
                          
        const colorData = RISK_GRADES_CONFIG[riskGrade] || RISK_GRADES_CONFIG['NA'];

        // CORREÇÃO ESSENCIAL: Estilo Transparente para Lotes 'NA' (Sem Risco)
        if (riskGrade === 'NA') {
            return {
                fillColor: 'transparent', 
                color: 'transparent',     
                weight: 0,
                opacity: 0,
                fillOpacity: 0
            };
        }

        // Estilos para Risco 1 a 4
        return {
            fillColor: colorData.color,
            color: colorData.color,
            weight: 1.5,
            opacity: 0.8,
            fillOpacity: 0.7
        };
        
    } else if (type === 'app') {
        // Estilo APP (Semi-transparente para ver o lote abaixo)
        return {
            fillColor: '#3498db', // Azul para APP
            color: '#2980b9',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.4 
        };
    } else if (type === 'poligonais') {
        // Estilo Outras Poligonais (Mais abaixo, pode ter uma cor mais sólida)
        return {
            fillColor: '#9b59b6', // Roxo
            color: '#8e44ad',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.5
        };
    }
}

// Utilitário para formatar valores (reduz duplicidade)
function formatValue(key, value) {
    if (value === null || value === undefined) return 'N/A';

    if (key.toUpperCase().includes('CUSTO') && typeof value === 'number') {
        return `R$ ${parseFloat(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
    }
    return value;
}


function onEachFeature(feature, layer) {
    let popupContent = "<strong>Dados do Lote/Feição:</strong><br>";
    if (feature.properties) {
        for (const key in feature.properties) {
            if (feature.properties.hasOwnProperty(key) && key.length < 30 && key.toUpperCase() !== 'ID') {
                popupContent += `<b>${key}:</b> ${formatValue(key, feature.properties[key])}<br>`;
            }
        }
    }
    layer.bindPopup(popupContent);
}

// ----------------------------------------------------
// 4. Lógica de Reprojeção (UTM)
function convertUtmToWgs84(easting, northing, utmZone) {
    const zoneNum = utmZone.slice(0, -1);
    const projDef = `+proj=utm +zone=${zoneNum} +${utmZone.endsWith('s') ? 'south' : 'north'} +ellps=GRS80 +units=m +no_defs`;
    
    if (!proj4.defs(utmZone)) {
        proj4.defs(utmZone, projDef);
    }
    
    const utm = proj4.defs(utmZone);
    const wgs84 = proj4.defs('WGS84');
    
    return proj4(utm, wgs84, [easting, northing]);
}

function transformUtm(geojsonData, sigasZone) {
    if (sigasZone === 'wgs84' || !geojsonData.features || geojsonData.features.length === 0) {
        return geojsonData;
    }
    
    function transformCoordinates(coords) {
        if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
            return coords.map(transformCoordinates);
        } else if (coords.length >= 2 && typeof coords[0] === 'number') {
            const [easting, northing] = coords;
            return convertUtmToWgs84(easting, northing, sigasZone); 
        }
        return coords;
    }

    if (geojsonData.type === 'FeatureCollection') {
        geojsonData.features = geojsonData.features.map(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates = transformCoordinates(feature.geometry.coordinates);
            }
            return feature;
        });
    }
    return geojsonData;
}

// ----------------------------------------------------
// 5. Lógica de Upload (OTIMIZADA)

// Função auxiliar para processar um único arquivo GeoJSON
function processGeoJSONFile(file, type, sigasZone, statusDiv) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                let geojsonData = JSON.parse(e.target.result);

                if (sigasZone !== 'wgs84') {
                    statusDiv.textContent = `Convertendo de ${sigasZone}...`;
                    geojsonData = transformUtm(geojsonData, sigasZone);
                }
                
                statusDiv.textContent = `Sucesso! ${geojsonData.features.length} feições carregadas.`;
                statusDiv.className = 'upload-status status-success';
                resolve(geojsonData);

            } catch (error) {
                statusDiv.textContent = `Erro ao processar o arquivo: ${error.message}`;
                statusDiv.className = 'upload-status status-error';
                reject(error);
            }
        };

        reader.onerror = () => {
            statusDiv.textContent = `Erro de leitura do arquivo.`;
            statusDiv.className = 'upload-status status-error';
            reject(new Error("Erro de leitura do arquivo."));
        };

        reader.readAsText(file);
    });
}

async function handleFileUpload(type) {
    const fileInput = document.getElementById(`geojson-${type}-file`);
    const statusDiv = document.getElementById(`status-${type}`);
    const sigasZone = document.getElementById(`siga-${type}-select`).value;

    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    statusDiv.textContent = `Lendo arquivo...`;
    statusDiv.className = 'upload-status';

    try {
        const geojsonData = await processGeoJSONFile(file, type, sigasZone, statusDiv);
        
        // Atribuição da variável global 
        if (type === 'lotes') {
            allLotesGeoJSON = geojsonData;
        } else if (type === 'app') {
            allAPPGeoJSON = geojsonData;
        } else if (type === 'poligonais') {
            allPoligonaisGeoJSON = geojsonData;
        }

        updateMapLayers(type);
        
        if (type === 'lotes') {
            updateSummaryCards(allLotesGeoJSON.features);
            updateNucleoFilter(allLotesGeoJSON.features);
            updateRiskControl(allLotesGeoJSON.features);
            applyFilters(); 
        }

    } catch (error) {
        console.error(`Falha no upload de ${type}:`, error);
    }
}


// ----------------------------------------------------
// 6. Lógica de Renderização e Filtro

function applyFilters() {
    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) {
        renderLotesLayer([]);
        updateSummaryCards([]);
        populateDataTable([]);
        return;
    }

    const selectedNucleo = document.getElementById('nucleo-filter').value;
    let features = allLotesGeoJSON.features;

    // 1. Filtro por Núcleo (Poligonal)
    if (selectedNucleo !== 'all') {
        features = features.filter(f => (f.properties.NUCLEO || 'N/A') === selectedNucleo);
    }

    // 2. Filtro por Risco (Grau de Cor)
    const activeGrades = Object.keys(RISK_GRADES_CONFIG).filter(g => RISK_GRADES_CONFIG[g].toggle);
    features = features.filter(f => {
        // Usa a mesma lógica de tratamento de nulo do estilo para o filtro
        const riskProperty = f.properties.GRAU_RISCO;
        const featureGrade = (riskProperty === null || riskProperty === undefined || riskProperty === 0) 
                             ? 'NA' 
                             : String(riskProperty);
        
        return activeGrades.includes(featureGrade); 
    });

    filteredLotesFeatures = features;
    
    // 3. Redesenha e atualiza UI
    renderLotesLayer(filteredLotesFeatures);
    updateSummaryCards(filteredLotesFeatures);
    populateDataTable(filteredLotesFeatures);
}

function renderLotesLayer(featuresToRender) {
    if (lotesLayer) {
        map.removeLayer(lotesLayer);
    }
    
    if (featuresToRender.length === 0) {
        lotesLayer = null;
        return;
    }

    const featureCollection = turf.featureCollection(featuresToRender);

    lotesLayer = L.geoJson(featureCollection, {
        style: (feature) => getStyleForRisco(feature, 'lotes'),
        onEachFeature: onEachFeature
    });

    // Se a camada já existe, apenas a adicionamos novamente com o novo estilo.
    if (map.hasLayer(lotesLayer)) {
        map.removeLayer(lotesLayer); // Apenas por segurança, embora o código acima já faça isso.
    }
    map.addLayer(lotesLayer);
    lotesLayer.bringToFront(); // Garante que a camada de risco/lote está no topo

    if(lotesLayer.getBounds().isValid()) {
         map.fitBounds(lotesLayer.getBounds());
    }
}

function updateMapLayers(type) {
    
    // 1. Remove todas as camadas que vamos atualizar
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);
    if (appLayer) map.removeLayer(appLayer);
    if (lotesLayer) map.removeLayer(lotesLayer);
    
    // 2. Ordem de Empilhamento (Bottom to Top):
    
    // CAMADA 1 (Bottom): Poligonais
    if (allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJson(allPoligonaisGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'poligonais'),
            onEachFeature: onEachFeature
        }).addTo(map);
    } else {
        poligonaisLayer = null;
    }
    
    // CAMADA 2: APP
    if (allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJson(allAPPGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'app'),
            onEachFeature: onEachFeature
        }).addTo(map);
    } else {
        appLayer = null;
    }
    
    // CAMADA 3 (Top): Lotes/Risco (Chama o filtro para re-renderizar e adicionar ao mapa)
    if (type === 'lotes') {
        applyFilters(); 
    } else if (lotesLayer) {
         map.addLayer(lotesLayer);
         lotesLayer.bringToFront();
    }

    updateLayerControl();
}

// ----------------------------------------------------
// 7. Controles do Dashboard (Filtros e Camadas)

function updateNucleoFilter(features) {
    const nucleoSelect = document.getElementById('nucleo-filter');
    const nucleos = new Set(features.map(f => f.properties.NUCLEO || 'N/A').filter(n => n !== 'N/A'));
    
    const currentOptions = nucleoSelect.options[0].outerHTML;
    nucleoSelect.innerHTML = currentOptions; 
    
    nucleos.forEach(nucleo => {
        nucleoSelect.innerHTML += `<option value="${nucleo}">${nucleo}</option>`;
    });
}

function updateLayerControl() {
    const mainList = document.getElementById('main-layer-list');
    mainList.innerHTML = ''; 
    
    const isLotesLoaded = allLotesGeoJSON.features.length > 0;
    
    if (isLotesLoaded) {
        // Lotes: a cor é a média de risco, mas aqui usamos uma cor neutra para o controle
        mainList.innerHTML += `
            <li class="layer-item">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #2c3e50;"></span>
                    Lotes (${allLotesGeoJSON.features.length})
                </span>
                <input type="checkbox" checked disabled>
            </li>
        `;
    }
    
    if (allAPPGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('app', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #3498db;"></span>
                    APP (${allAPPGeoJSON.features.length})
                </span>
                <input type="checkbox" ${appLayer && map.hasLayer(appLayer) ? 'checked' : ''}>
            </li>
        `;
    }
    
    if (allPoligonaisGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('poligonais', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #9b59b6;"></span>
                    Outras Poligonais (${allPoligonaisGeoJSON.features.length})
                </span>
                <input type="checkbox" ${poligonaisLayer && map.hasLayer(poligonaisLayer) ? 'checked' : ''}>
            </li>
        `;
    }
}

function toggleLayer(type, listItem) {
    const checkbox = listItem.querySelector('input[type="checkbox"]');
    
    if (type === 'app' && appLayer) {
        if (map.hasLayer(appLayer)) {
            map.removeLayer(appLayer);
            checkbox.checked = false;
        } else {
            map.addLayer(appLayer);
            checkbox.checked = true;
            if (lotesLayer) lotesLayer.bringToFront();
        }
    } else if (type === 'poligonais' && poligonaisLayer) {
        if (map.hasLayer(poligonaisLayer)) {
            map.removeLayer(poligonaisLayer);
            checkbox.checked = false;
        } else {
            map.addLayer(poligonaisLayer);
            checkbox.checked = true;
            if (appLayer) appLayer.bringToBack(); 
        }
    }
}


function updateRiskControl(features) {
    const list = document.getElementById('risk-layer-filter');
    list.innerHTML = '';
    
    Object.keys(RISK_GRADES_CONFIG).forEach(key => RISK_GRADES_CONFIG[key].count = 0);

    // Contagem baseada em TODOS os lotes carregados
    allLotesGeoJSON.features.forEach(f => {
        // Tratamento de nulos/ausentes para contagem
        const riskProperty = f.properties.GRAU_RISCO;
        const grade = (riskProperty === null || riskProperty === undefined || riskProperty === 0) 
                      ? 'NA' 
                      : String(riskProperty);

        if (RISK_GRADES_CONFIG[grade]) {
            RISK_GRADES_CONFIG[grade].count++;
        }
    });

    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        const data = RISK_GRADES_CONFIG[grade];
        const listItem = document.createElement('li');
        listItem.className = `risk-legend-item ${data.toggle ? 'active' : ''}`;
        
        // Se for o NULO, usa uma borda para indicar o filtro, mas não a cor
        listItem.style.borderLeftColor = grade === 'NA' ? '#7f8c8d' : data.color;
        
        listItem.setAttribute('data-grade', grade);
        listItem.innerHTML = `
            <span class="layer-name">${data.name}</span>
            <span style="font-size: 0.8em; font-weight: bold;">(${data.count})</span>
            <input type="checkbox" ${data.toggle ? 'checked' : ''} onchange="toggleRiskGrade('${grade}', this)">
        `;
        list.appendChild(listItem);
    });
}

function toggleRiskGrade(grade, checkbox) {
    RISK_GRADES_CONFIG[grade].toggle = checkbox.checked;
    const listItem = checkbox.closest('.risk-legend-item');
    
    if (checkbox.checked) {
        listItem.classList.add('active');
    } else {
        listItem.classList.remove('active');
    }

    applyFilters(); 
}


// ----------------------------------------------------
// 8. Atualização dos Cards de Resumo
function updateSummaryCards(features) {
    let totalLotesFiltrados = features.length;
    let totalLotesComRisco = 0;
    let totalLotesEmAPP = 0;
    let custoTotal = 0;

    features.forEach(feature => {
        const props = feature.properties;
        if (props) {
            // Lotes em Risco (Grau > 1)
            if (props.GRAU_RISCO && props.GRAU_RISCO > 1) {
                totalLotesComRisco++;
            }
            
            // Lotes em APP
            if (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM') {
                totalLotesEmAPP++;
            }

            // Soma o custo (com validação)
            if (props.CUSTO && typeof props.CUSTO === 'number') {
                custoTotal += props.CUSTO;
            }
        }
    });
    
    // Atualiza os cards
    document.getElementById('totalLotesCarregados').textContent = totalLotesFiltrados; 
    document.getElementById('totalLotesComRisco').textContent = totalLotesComRisco;
    document.getElementById('totalLotesEmAPP').textContent = totalLotesEmAPP;
    document.getElementById('custoEstimadoTotal').textContent = `R$ ${custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    updateReportHighlights(features);
}

// ----------------------------------------------------
// 9. Destaques de Relatório
function updateReportHighlights(features) {
    const reportMaxCostEl = document.getElementById('report-max-cost');
    const reportMaxCostInfoEl = document.getElementById('report-max-cost-info');
    const reportMinCostEl = document.getElementById('report-min-cost');
    const reportMinCostInfoEl = document.getElementById('report-min-cost-info');

    reportMaxCostEl.textContent = 'R$ 0,00';
    reportMaxCostInfoEl.textContent = 'Lote/ID: N/A';
    reportMinCostEl.textContent = 'R$ 0,00';
    reportMinCostInfoEl.textContent = 'Lote/ID: N/A';

    if (features.length === 0) return;

    let maxCostFeature = null;
    let minCostFeature = null;
    let maxCost = -Infinity;
    let minCost = Infinity;

    const featuresWithCost = features.filter(f => f.properties.CUSTO && typeof f.properties.CUSTO === 'number');

    if (featuresWithCost.length === 0) return;

    featuresWithCost.forEach(f => {
        const custo = f.properties.CUSTO;
        
        if (custo > maxCost) {
            maxCost = custo;
            maxCostFeature = f;
        }
        
        if (custo < minCost) {
            minCost = custo;
            minCostFeature = f;
        }
    });

    const formatCost = (cost) => `R$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const getID = (f) => f.properties.ID_LOTE || f.properties.ID || 'N/A';
    
    if (maxCostFeature) {
        reportMaxCostEl.textContent = formatCost(maxCost);
        reportMaxCostInfoEl.textContent = `Lote/ID: ${getID(maxCostFeature)}`;
    }

    if (minCostFeature) {
        reportMinCostEl.textContent = formatCost(minCost);
        reportMinCostInfoEl.textContent = `Lote/ID: ${getID(minCostFeature)}`;
    }
}

// ----------------------------------------------------
// 10. Geração de Relatório e Gráfico
let riskChartInstance = null; 

document.getElementById('generateReportBtn').addEventListener('click', () => {
    if (allLotesGeoJSON.features.length === 0) {
        alert('Por favor, carregue os dados de lotes primeiro.');
        return;
    }
    
    const reportMsg = document.getElementById('report-message');
    const reportContent = document.getElementById('generatedReportContent');
    const featuresToReport = filteredLotesFeatures.length > 0 ? filteredLotesFeatures : allLotesGeoJSON.features;
    
    reportMsg.textContent = 'Gerando relatório...';

    // 1. Geração do Gráfico 
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];

    const riskCounts = {};
    Object.keys(RISK_GRADES_CONFIG).forEach(key => riskCounts[key] = 0);

    featuresToReport.forEach(f => {
        const riskProperty = f.properties.GRAU_RISCO;
        const grade = (riskProperty === null || riskProperty === undefined || riskProperty === 0) 
                      ? 'NA' 
                      : String(riskProperty);
        riskCounts[grade] = (riskCounts[grade] || 0) + 1;
    });

    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        labels.push(RISK_GRADES_CONFIG[grade].name);
        dataValues.push(riskCounts[grade]);
        // Garante que o 'NA' não tem cor no gráfico, se for o caso
        backgroundColors.push(grade === 'NA' ? '#cccccc' : RISK_GRADES_CONFIG[grade].color);
    });

    if (riskChartInstance) {
        riskChartInstance.destroy();
    }
    
    const ctx = document.getElementById('riskChartReport').getContext('2d');
    riskChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Lotes por Grau de Risco',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Quantidade de Lotes' } },
                x: { title: { display: true, text: 'Grau de Risco' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });


    // 2. Geração do Texto (Formato Profissional)
    const totalLotesFiltrados = featuresToReport.length;
    let custoTotalFiltrado = 0;
    featuresToReport.forEach(f => {
        if (f.properties.CUSTO && typeof f.properties.CUSTO === 'number') {
            custoTotalFiltrado += f.properties.CUSTO;
        }
    });
    
    const nucleoText = document.getElementById('nucleo-filter').options[document.getElementById('nucleo-filter').selectedIndex].text;
    const maxCostDisplay = document.getElementById('report-max-cost').textContent;
    const maxCostInfoDisplay = document.getElementById('report-max-cost-info').textContent;
    const minCostDisplay = document.getElementById('report-min-cost').textContent;
    const minCostInfoDisplay = document.getElementById('report-min-cost-info').textContent;
    const totalLotesRisco = document.getElementById('totalLotesComRisco').textContent;
    const totalLotesAPP = document.getElementById('totalLotesEmAPP').textContent;


    let reportText = `RELATÓRIO DE ANÁLISE GEOGRÁFICA - GeoLaudo.AI\n\n`;
    reportText += `Data de Geração: ${new Date().toLocaleString('pt-BR')}\n`;
    reportText += `Núcleo Filtrado: ${nucleoText}\n\n`;

    reportText += `--- 1. RESUMO GERAL ---\n`;
    reportText += `Total de Lotes Analisados: ${totalLotesFiltrados}\n`;
    reportText += `Total de Lotes em Risco (Grau 2 ou mais): ${totalLotesRisco}\n`;
    reportText += `Total de Lotes em APP: ${totalLotesAPP}\n`;
    reportText += `\n`;

    reportText += `--- 2. DETALHAMENTO DE RISCO ---\n`;
    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        reportText += `${RISK_GRADES_CONFIG[grade].name}: ${riskCounts[grade]} Lotes\n`;
    });
    reportText += `\n`;

    reportText += `--- 3. ANÁLISE DE CUSTO ESTIMADO ---\n`;
    reportText += `Custo Total Estimado para Intervenção: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Lote com Maior Custo (${maxCostDisplay}): ${maxCostInfoDisplay}\n`;
    reportText += `Lote com Menor Custo (${minCostDisplay}): ${minCostInfoDisplay}\n`;
    reportText += `\nEste valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI.`;

    reportContent.textContent = reportText;
    reportContent.scrollTop = 0; 
    
    reportMsg.textContent = 'Relatório gerado com sucesso!';
    document.getElementById('exportReportBtn').style.display = 'inline-block'; 
});


// ----------------------------------------------------
// 11. Funções de Tabela
function populateDataTable(features) {
    const table = document.getElementById('lotesDataTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (features.length === 0) {
        thead.innerHTML = '<tr><th>Nenhum dado filtrado ou carregado.</th></tr>';
        return;
    }

    const properties = features[0].properties;
    let headerRow = '<tr>';
    const keys = [];
    for (const key in properties) {
         if (properties.hasOwnProperty(key)) {
            headerRow += `<th>${key}</th>`;
            keys.push(key);
        }
    }
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    features.forEach(feature => {
        let bodyRow = '<tr>';
        keys.forEach(key => {
            bodyRow += `<td>${formatValue(key, feature.properties[key])}</td>`;
        });
        bodyRow += '</tr>';
        tbody.innerHTML += bodyRow;
    });
}

function filterDataTable() {
    const input = document.getElementById('dataTableFilter');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('lotesDataTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        let display = false;
        const td = tr[i].getElementsByTagName('td');
        for (let j = 0; j < td.length; j++) {
            if (td[j]) {
                const txtValue = td[j].textContent || td[j].innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    display = true;
                    break;
                }
            }
        }
        tr[i].style.display = display ? '' : 'none';
    }
}

function exportDataTableToCSV() {
    const table = document.getElementById('lotesDataTable');
    if (table.rows.length <= 1) {
        alert('Não há dados para exportar.');
        return;
    }

    let csv = [];
    const headerRow = table.querySelector('thead tr');
    csv.push(Array.from(headerRow.cells).map(cell => cell.textContent).join(';'));

    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
        if (row.style.display !== 'none') { 
            csv.push(Array.from(row.cells).map(cell => {
                let text = cell.textContent.replace(/\s\s+/g, ' ').trim();
                if (text.startsWith('R$')) {
                    text = text.replace('R$ ', '').replace('.', '').replace(',', '.');
                }
                return `"${text}"`; 
            }).join(';'));
        }
    });

    const csvFile = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(csvFile);
    link.download = 'dados_lotes_geolaudo.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ----------------------------------------------------
// 12. Lógica de Exportação do Relatório TXT

document.getElementById('exportReportBtn').addEventListener('click', () => {
    const reportContent = document.getElementById('generatedReportContent').textContent;
    if (reportContent.includes('Nenhum relatório gerado ainda')) {
        alert('Por favor, gere um relatório primeiro na aba "Relatórios".');
        return;
    }

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'relatorio_geolaudo.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// FIM
