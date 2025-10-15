// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; 
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 
let filteredLotesFeatures = []; 

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

const DEFAULT_CENTER = [-15.7801, -47.9297]; // Centro de Brasília

// ----------------------------------------------------
// Definições de Cores e Níveis de Risco (Grau 1 a 4)
const RISK_GRADES_CONFIG = {
    '1': { color: '#2ecc71', name: 'Grau 1 (Risco Baixo)', toggle: true, count: 0 },  // Verde
    '2': { color: '#f1c40f', name: 'Grau 2 (Risco Moderado)', toggle: true, count: 0 }, // Amarelo
    '3': { color: '#e67e22', name: 'Grau 3 (Risco Elevado)', toggle: true, count: 0 }, // Laranja
    '4': { color: '#e74c3c', name: 'Grau 4 (Risco Crítico)', toggle: true, count: 0 },  // Vermelho
    'NA': { color: '#7f8c8d', name: 'Sem Risco Atribuído', toggle: true, count: 0 } // Cinza
};

// ----------------------------------------------------
// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    
    if (map) map.remove(); 

    map = L.map('mapid').setView(DEFAULT_CENTER, 4);

    // OpenStreetMap - Camada base padrão
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // CHAMADA ESSENCIAL: Garante que o mapa calcule seu tamanho inicial
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

            // 1. Gerencia as classes ativas
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // 2. CORREÇÃO ESSENCIAL PARA MAPA CINZA AO TROCAR DE ABA
            if (targetSectionId === 'dashboard' && map) {
                // Pequeno atraso para garantir que o CSS da aba "active" seja aplicado e a div esteja visível
                setTimeout(() => {
                    map.invalidateSize(); // Força o mapa a recalcular seu tamanho
                    if (lotesLayer && lotesLayer.getBounds().isValid()) {
                         map.fitBounds(lotesLayer.getBounds());
                    } else {
                        map.setView(DEFAULT_CENTER, 4);
                    }
                }, 50); 
            }
        });
    });

    // 3. Garante que a primeira aba (Dashboard) esteja ativa ao carregar
    const dashboardSection = document.getElementById('dashboard');
    const dashboardLink = document.querySelector('a[data-section="dashboard"]');
    
    if (dashboardSection && dashboardLink) {
        dashboardSection.classList.add('active');
        dashboardLink.classList.add('active');
    }
}

// ----------------------------------------------------
// INICIALIZAÇÃO PRINCIPAL (garante que o DOM e as bibliotecas estejam prontos)
window.addEventListener('load', () => {
    console.log('Window Load: Inicializando GeoLaudo.AI');
    setupTabNavigation();
    initMap(); 
    
    document.getElementById('exportReportBtn').style.display = 'none';

    // Se houver dados (na primeira execução, não há), chama a atualização
    if (allLotesGeoJSON.features.length > 0) {
        updateSummaryCards(allLotesGeoJSON.features);
        updateNucleoFilter(allLotesGeoJSON.features);
        updateRiskControl(allLotesGeoJSON.features);
        populateDataTable(allLotesGeoJSON.features);
        applyFilters();
    }
});


// ----------------------------------------------------
// 3. Lógica de Estilo e Camadas

function getStyleForRisco(feature, type = 'lotes') {
    if (type === 'lotes') {
        const riskGrade = String(feature.properties.GRAU_RISCO) || 'NA'; 
        const colorData = RISK_GRADES_CONFIG[riskGrade] || RISK_GRADES_CONFIG['NA'];

        return {
            fillColor: colorData.color,
            color: colorData.color,
            weight: 1.5,
            opacity: 0.8,
            fillOpacity: 0.7
        };
    } else if (type === 'app') {
        return {
            fillColor: '#3498db', // Azul para APP
            color: '#2980b9',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.4
        };
    } else if (type === 'poligonais') {
        return {
            fillColor: '#9b59b6', // Roxo
            color: '#8e44ad',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.5
        };
    }
}

function onEachFeature(feature, layer) {
    let popupContent = "<strong>Dados do Lote/Feição:</strong><br>";
    if (feature.properties) {
        for (const key in feature.properties) {
            if (feature.properties.hasOwnProperty(key) && key.length < 30 && key.toUpperCase() !== 'ID') {
                let value = feature.properties[key];
                if (key.toUpperCase().includes('CUSTO')) {
                     value = `R$ ${parseFloat(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
                }
                popupContent += `<b>${key}:</b> ${value}<br>`;
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
    
    return proj4(utm, wgs84, [easting, northing]); // Retorna [longitude, latitude]
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
// 5. Lógica de Upload

function handleFileUpload(type) {
    const fileInput = document.getElementById(`geojson-${type}-file`);
    const statusDiv = document.getElementById(`status-${type}`);
    const sigasZone = document.getElementById(`siga-${type}-select`).value;

    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    statusDiv.textContent = `Lendo arquivo...`;
    statusDiv.className = 'upload-status';

    reader.onload = function(e) {
        try {
            let geojsonData = JSON.parse(e.target.result);

            if (sigasZone !== 'wgs84') {
                statusDiv.textContent = `Convertendo de ${sigasZone}...`;
                geojsonData = transformUtm(geojsonData, sigasZone);
            }
            
            if (type === 'lotes') {
                allLotesGeoJSON = geojsonData;
            } else if (type === 'app') {
                allAPPGeoJSON = geojsonData;
            } else if (type === 'poligonais') {
                allPoligonaisGeoJSON = geojsonData;
            }

            statusDiv.textContent = `Sucesso! ${geojsonData.features.length} feições carregadas.`;
            statusDiv.className = 'upload-status status-success';
            
            updateMapLayers(type);
            
            if (type === 'lotes') {
                updateSummaryCards(allLotesGeoJSON.features);
                updateNucleoFilter(allLotesGeoJSON.features);
                updateRiskControl(allLotesGeoJSON.features);
                populateDataTable(allLotesGeoJSON.features);
            }
            

        } catch (error) {
            statusDiv.textContent = `Erro ao processar o arquivo: ${error.message}`;
            statusDiv.className = 'upload-status status-error';
            console.error("Erro no processamento do GeoJSON:", error);
        }
    };

    reader.readAsText(file);
}

// ----------------------------------------------------
// 6. Lógica de Renderização e Filtro

function applyFilters() {
    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) {
        renderLotesLayer([]);
        updateSummaryCards([]);
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
        const featureGrade = String(f.properties.GRAU_RISCO) || 'NA';
        return activeGrades.includes(featureGrade); 
    });

    filteredLotesFeatures = features;
    
    // 3. Redesenha a camada
    renderLotesLayer(filteredLotesFeatures);
    
    // 4. Atualiza os cards com as novas estatísticas filtradas
    updateSummaryCards(filteredLotesFeatures);
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
    }).addTo(map);

    if(lotesLayer.getBounds().isValid()) {
         map.fitBounds(lotesLayer.getBounds());
    }
}

function updateMapLayers(type) {
    if (type === 'lotes') {
        applyFilters(); 
    }
    
    // 2. APP
    if (appLayer) map.removeLayer(appLayer);
    if (allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJson(allAPPGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'app'),
            onEachFeature: onEachFeature
        }).addTo(map);
        if (lotesLayer) lotesLayer.bringToFront();
    } else {
        appLayer = null;
    }

    // 3. Poligonais
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);
    if (allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJson(allPoligonaisGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'poligonais'),
            onEachFeature: onEachFeature
        }).addTo(map);
        if (lotesLayer) lotesLayer.bringToFront();
    } else {
        poligonaisLayer = null;
    }

    updateLayerControl();
}

// ----------------------------------------------------
// 7. Controles do Dashboard (Filtros e Camadas)

function updateNucleoFilter(features) {
    const nucleoSelect = document.getElementById('nucleo-filter');
    const nucleos = new Set(features.map(f => f.properties.NUCLEO || 'N/A').filter(n => n !== 'N/A'));
    
    const currentOptions = nucleoSelect.innerHTML;
    nucleoSelect.innerHTML = currentOptions.split('</option>')[0] + '</option>'; 
    
    nucleos.forEach(nucleo => {
        nucleoSelect.innerHTML += `<option value="${nucleo}">${nucleo}</option>`;
    });
}

function updateLayerControl() {
    const mainList = document.getElementById('main-layer-list');
    mainList.innerHTML = ''; 
    
    if (allLotesGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('lotes', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #2c3e50;"></span>
                    Lotes (${allLotesGeoJSON.features.length})
                </span>
                <input type="checkbox" ${lotesLayer ? 'checked' : ''} disabled>
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
                <input type="checkbox" ${appLayer ? 'checked' : ''}>
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
                <input type="checkbox" ${poligonaisLayer ? 'checked' : ''}>
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
        }
    } else if (type === 'poligonais' && poligonaisLayer) {
        if (map.hasLayer(poligonaisLayer)) {
            map.removeLayer(poligonaisLayer);
            checkbox.checked = false;
        } else {
            map.addLayer(poligonaisLayer);
            checkbox.checked = true;
        }
    }
}


function updateRiskControl(features) {
    const list = document.getElementById('risk-layer-filter');
    list.innerHTML = '';
    
    Object.keys(RISK_GRADES_CONFIG).forEach(key => RISK_GRADES_CONFIG[key].count = 0);

    features.forEach(f => {
        const grade = String(f.properties.GRAU_RISCO) || 'NA';
        if (RISK_GRADES_CONFIG[grade]) {
            RISK_GRADES_CONFIG[grade].count++;
        }
    });

    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        const data = RISK_GRADES_CONFIG[grade];
        const listItem = document.createElement('li');
        listItem.className = `risk-legend-item ${data.toggle ? 'active' : ''}`;
        listItem.style.borderLeftColor = data.color;
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
    document.getElementById('totalLotesCarregados').textContent = allLotesGeoJSON.features.length;

    let totalLotesFiltrados = features.length;
    let totalLotesComRisco = 0;
    let totalLotesEmAPP = 0;
    let custoTotal = 0;

    features.forEach(feature => {
        const props = feature.properties;
        if (props) {
            // Lotes em Risco (Grau > 1 ou LOTE_APP = 'SIM')
            if ((props.GRAU_RISCO && props.GRAU_RISCO > 1) || (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM')) {
                totalLotesComRisco++;
            }
            
            // Lotes em APP
            if (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM') {
                totalLotesEmAPP++;
            }

            // Soma o custo
            if (props.CUSTO && typeof props.CUSTO === 'number') {
                custoTotal += props.CUSTO;
            }
        }
    });
    
    // Atualiza os cards com base nos lotes *filtrados*
    document.getElementById('totalLotesCarregados').textContent = totalLotesFiltrados; // Mostra os filtrados aqui
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

    // Reset
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

    // 1. Geração do Gráfico (Simulação)
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];

    const riskCounts = {};
    Object.keys(RISK_GRADES_CONFIG).forEach(key => riskCounts[key] = 0);

    featuresToReport.forEach(f => {
        const grade = String(f.properties.GRAU_RISCO) || 'NA';
        riskCounts[grade] = (riskCounts[grade] || 0) + 1;
    });

    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        labels.push(RISK_GRADES_CONFIG[grade].name);
        dataValues.push(riskCounts[grade]);
        backgroundColors.push(RISK_GRADES_CONFIG[grade].color);
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
}


// ----------------------------------------------------
// 11. Funções de Tabela 

function populateDataTable(features) {
    const table = document.getElementById('lotesDataTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (features.length === 0) return;

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
            let value = feature.properties[key];
            if (key.toUpperCase().includes('CUSTO') && typeof value === 'number') {
                 value = `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            bodyRow += `<td>${value}</td>`;
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
