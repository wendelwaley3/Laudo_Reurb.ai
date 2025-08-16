// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] };
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 

// VARIÁVEL PARA INFORMAÇÕES GERAIS (MANUAL)
let generalProjectInfo = {}; 

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

// Mapa de estilos para riscos
const riscoStyles = {
    'Baixo': { fillColor: '#2ecc71', color: 'white' },        // Verde
    'Médio': { fillColor: '#f39c12', color: 'white' },        // Laranja
    'Alto': { fillColor: '#e74c3c', color: 'white' },         // Vermelho
    'Muito Alto': { fillColor: '#c0392b', color: 'white' },   // Vermelho escuro
    'N/A': { fillColor: '#3498db', color: 'white' },           // Azul padrão para risco não definido
    'Geológico': { fillColor: '#e74c3c', color: 'white' }     // NOVO: Estilo para "Geológico" (exemplo: Alto risco)
};

// ========================================================================================
// IMPORTANTE: DEFINIÇÃO DO SISTEMA DE COORDENADAS UTM PARA REPROJEÇÃO
// ========================================================================================
// Baseado nas suas coordenadas (E/X: 341012,41 e N/Y: 7943447,24), assumimos SIRGAS 2000 / UTM Zone 23S (EPSG:31983).
// É CRÍTICO QUE VOCÊ CONFIRME O EPSG EXATO DOS SEUS DADOS.
// Você pode encontrar as definições PROJ4 em https://epsg.io/ (busque pelo seu EPSG, ex: 31983)
if (typeof proj4 !== 'undefined') {
    // Definimos a projeção para SIRGAS 2000 / UTM Zone 23S (EPSG:31983)
    // Se precisar de outra zona, mude o 'zone=XX' e possivelmente o 'south'/'north' e o EPSG.
    proj4.defs('EPSG:31983', '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
    
    console.log("Definição EPSG:31983 carregada para reprojeção UTM.");
} else {
    console.error("Proj4js não carregado. A reprojeção UTM não funcionará. Certifique-se que o script proj4.min.js está no index.html.");
}
// ========================================================================================


// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Coordenadas iniciais (centro do Brasil)
    console.log('initMap: Objeto mapa criado.'); 

    // Basemap OpenStreetMap (Voltando ao OSM puro, que geralmente funciona)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 0, 
        maxZoom: 19 
    });
    osmLayer.addTo(map); // Define como o mapa base padrão
    console.log('initMap: Basemap OpenStreetMap adicionado como padrão.'); 

    // Basemap Esri World Street Map (Agora como opção)
    const esriStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
        minZoom: 0,
        maxZoom: 19
    });

    // Basemap Esri World Imagery (Satélite)
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer, // Agora é o padrão
        "Esri World Street Map": esriStreetMap, 
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Adiciona listeners para os checkboxes da legenda personalizada
    document.getElementById('toggleLotes').addEventListener('change', (e) => toggleLayerVisibility(lotesLayer, e.target.checked));
    document.getElementById('togglePoligonais').addEventListener('change', (e) => toggleLayerVisibility(poligonaisLayer, e.target.checked));
    document.getElementById('toggleAPP').addEventListener('change', (e) => toggleLayerVisibility(appLayer, e.target.checked));
    
    // map.invalidateSize() é chamado em DOMContentLoaded e na mudança de abas
    console.log('initMap: Mapa inicializado com sucesso.'); 
}

// Função para ligar/desligar a visibilidade da camada no mapa
function toggleLayerVisibility(layer, isVisible) {
    if (layer) {
        if (isVisible && !map.hasLayer(layer)) {
            layer.addTo(map);
        } else if (!isVisible && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

// 2. Navegação entre Seções
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetSectionId = this.getAttribute('data-section');
        console.log(`Navegação: Clicado em ${targetSectionId}`); 

        // Remove 'active' de todas as seções e links
        document.querySelectorAll('main section').forEach(section => {
            section.classList.remove('active');
        });
        document.querySelectorAll('nav a').forEach(navLink => {
            navLink.classList.remove('active');
        });

        // Adiciona 'active' à seção e link clicados
        document.getElementById(targetSectionId).classList.add('active');
        this.classList.add('active');

        // Garante que o mapa renderize corretamente após a seção do dashboard se tornar visível
        if (targetSectionId === 'dashboard' && map) {
            console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
            map.invalidateSize();
        }
    });
});

// 3. Funções de Upload e Processamento de GeoJSON
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados.'); 
    initMap(); // Inicializa o mapa ao carregar a página
    setupFileUpload(); // Configura o upload de arquivos
    setupGeneralInfoForm(); // Configura o formulário de informações gerais
    // Garante que o dashboard esteja visível por padrão ao carregar a página
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});

function setupFileUpload() {
    console.log('setupFileUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    // SELECIONA O BOTÃO VISÍVEL PELO ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton'); 

    let selectedFiles = []; 

    // Verifica se os elementos foram encontrados (para depuração)
    if (!fileInput) console.error('setupFileUpload ERRO: #geojsonFileInput não encontrado!');
    if (!selectFilesVisibleButton) console.error('setupFileUpload ERRO: #selectFilesVisibleButton não encontrado!');

    // ADICIONA LISTENER DE CLIQUE AO BOTÃO VISÍVEL
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto.'); 
            fileInput.click(); // Isso abre o diálogo de seleção de arquivos do navegador
        });
    } else {
        console.error('setupFileUpload: Botão visível ou input de arquivo não encontrados. O upload não funcionará.');
    }

    // Lida com a seleção de arquivos via input (ocorrendo após o diálogo ser fechado)
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        selectedFiles = Array.from(e.target.files);
        displaySelectedFiles(selectedFiles);
    });

    // Lida com o arrastar e soltar
    dragDropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        dragDropArea.classList.add('dragging');
    });
    dragDropArea.addEventListener('dragleave', () => {
        dragDropArea.classList.remove('dragging');
    });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('dragging');
        selectedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        displaySelectedFiles(selectedFiles);
    });

    // Exibe os nomes dos arquivos selecionados na lista
    function displaySelectedFiles(files) {
        console.log('displaySelectedFiles: Exibindo arquivos selecionados.'); 
        fileListElement.innerHTML = ''; 
        if (files.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            files.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    }

    // Botão Processar e Carregar Dados
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        if (selectedFiles.length === 0) {
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.';
            uploadStatus.className = 'status-message error';
            return;
        }

        uploadStatus.textContent = 'Processando e carregando dados...';
        uploadStatus.className = 'status-message info';

        // Limpa os dados globais e camadas do mapa antes de carregar novos
        allLotesGeoJSON.features = [];
        allAPPGeoJSON.features = [];
        allPoligonaisGeoJSON.features = [];
        
        // Remove as camadas atuais do mapa e do controle de legenda
        if (lotesLayer) map.removeLayer(lotesLayer);
        if (appLayer) map.removeLayer(appLayer);
        if (poligonaisLayer) map.removeLayer(poligonaisLayer);
        lotesLayer = null;
        appLayer = null;
        poligonaisLayer = null;


        const nucleosSet = new Set(); // Para coletar núcleos únicos dos lotes

        for (const file of selectedFiles) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                const geojsonData = JSON.parse(fileContent);

                // Validação básica do GeoJSON
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                // Lógica para determinar se o GeoJSON precisa de reprojeção (UTM -> Lat/Lon)
                let featuresToLoad = [];

                // Heurística para detectar UTM e reprojetar
                if (geojsonData.features.length > 0 && typeof proj4 !== 'undefined' && typeof L.Proj !== 'undefined' && proj4.defs['EPSG:31983']) { 
                    const sampleFeature = geojsonData.features[0];
                    if (sampleFeature.geometry && sampleFeature.geometry.coordinates) {
                        let sampleCoord = [];
                        const extractFirstCoord = (coords) => {
                            if (!coords || coords.length === 0) return null;
                            if (typeof coords[0] === 'number') return coords; // Point
                            if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') return coords[0]; // LineString, MultiPoint
                            if (Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && typeof coords[0][0][0] === 'number') return coords[0][0][0]; // Polygon, MultiLineString
                            if (Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && Array.isArray(coords[0][0][0]) && typeof coords[0][0][0][0] === 'number') return coords[0][0][0][0]; // MultiPolygon
                            return null;
                        };
                        sampleCoord = extractFirstCoord(sampleFeature.geometry.coordinates);
                        
                        if (sampleCoord && sampleCoord.length >= 2) {
                            const easting = sampleCoord[0];
                            const northing = sampleCoord[1];

                            // Heurística para UTM no Brasil (para SIRGAS 2000, zonas 22S, 23S, 24S)
                            // Easting entre 100.000 e 900.000
                            // Northing grande (7 milhões a 10 milhões para Hemisfério Sul)
                            if (easting > 100000 && easting < 900000 && northing > 1000000 && northing < 10000000) {
                                console.log(`Coordenadas de ${file.name} detectadas como UTM. Reprojetando para WGS84 usando EPSG:31983...`);
                                const utmCrs = new L.Proj.CRS('EPSG:31983'); 
                                featuresToLoad = L.Proj.geoJson(geojsonData, { crs: utmCrs }).toGeoJSON().features;
                                console.log(`Feições de ${file.name} reprojetadas com sucesso.`);
                            }
                        }
                    }
                }
                
                // Se não detectou UTM ou proj4/proj4leaflet não estão carregados, ou reprojeção não ocorreu,
                // carrega as feições como estão (assumindo WGS84)
                if (featuresToLoad.length === 0 && geojsonData.features.length > 0) {
                    featuresToLoad = geojsonData.features;
                    console.log(`Coordenadas de ${file.name} carregadas como WGS84 ou reprojeção não aplicável.`);
                }


                // Adiciona as feições processadas (originais ou reprojetadas) às camadas globais
                if (file.name.toLowerCase().includes('lotes')) {
                    allLotesGeoJSON.features.push(...featuresToLoad);
                    featuresToLoad.forEach(f => { 
                        // USA A PROPRIEDADE 'desc_nucleo' PARA O NOME DO NÚCLEO
                        if (f.properties && f.properties.desc_nucleo) { 
                            nucleosSet.add(f.properties.desc_nucleo);
                        }
                    });
                } else if (file.name.toLowerCase().includes('app')) {
                    allAPPGeoJSON.features.push(...featuresToLoad);
                } else { // Presume-se que o restante são poligonais diversas (ex: infraestrutura)
                    allPoligonaisGeoJSON.features.push(...featuresToLoad);
                }
                console.log(`Arquivo ${file.name} adicionado às camadas. Total de lotes até agora: ${allLotesGeoJSON.features.length}`); 

            } catch (error) {
                console.error(`Erro ao carregar ou processar ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                // Limpa os dados carregados parcialmente em caso de erro
                allLotesGeoJSON.features = [];
                allAPPGeoJSON.features = [];
                allPoligonaisGeoJSON.features = [];
                return; // Para de processar outros arquivos se um falhar
            }
        }

        // Carrega as camadas processadas no mapa
        renderLayersOnMap();
        // Atualiza o dashboard
        updateDashboard(allLotesGeoJSON.features);
        // Preenche o filtro de núcleos
        populateNucleusFilter(Array.from(nucleosSet));
        // Atualiza a tabela
        updateLotesTable(allLotesGeoJSON.features);

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Agora vá para o Dashboard.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados. Dados carregados no mapa e dashboard.'); 
    });
}

// 4. Renderiza as Camadas no Mapa
function renderLayersOnMap(featuresToDisplay = allLotesGeoJSON.features) {
    console.log('renderLayersOnMap: Renderizando camadas...'); 
    // Remove camadas existentes do mapa se houver
    if (lotesLayer) map.removeLayer(lotesLayer);
    if (appLayer) map.removeLayer(appLayer);
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);

    // Carrega lotes
    if (featuresToDisplay.length > 0) {
        lotesLayer = L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachFeatureLotes,
            style: styleLotes
        }).addTo(map);
        // Ajusta o mapa para a extensão dos dados SOMENTE se houver dados
        map.fitBounds(lotesLayer.getBounds());
        console.log('renderLayersOnMap: Lotes adicionados e mapa ajustado.'); 
    } else {
        // Se não houver lotes, centraliza o mapa no Brasil e limpa a camada de lotes
        map.setView([-15.7801, -47.9292], 5);
        document.getElementById('toggleLotes').checked = false; // Desmarca o checkbox
        console.log('renderLayersOnMap: Nenhum lote para exibir, mapa centralizado.'); 
    }

    // Carrega APP (não adiciona ao mapa por padrão, apenas o cria)
    if (allAPPGeoJSON && allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJSON(allAPPGeoJSON, {
            style: {
                color: '#e74c3c', // Vermelho para APP
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${key.toLowerCase() === 'area' ? feature.properties[key].toLocaleString('pt-BR') + ' m²' : feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox do APP esteja desmarcado e a camada invisível
        document.getElementById('toggleAPP').checked = false;
        if (map.hasLayer(appLayer)) map.removeLayer(appLayer); // Apenas para garantir
        console.log('renderLayersOnMap: Camada APP carregada (mas invisível por padrão).'); 
    }

    // Carrega Poligonais diversas (infraestrutura, etc.)
    if (allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJSON(allPoligonaisGeoJSON, {
            style: {
                color: '#2ecc71', // Verde para poligonais
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Informações da Poligonal</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${key.toLowerCase() === 'area' ? feature.properties[key].toLocaleString('pt-BR') + ' m²' : feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox de poligonais esteja desmarcado e a camada invisível
        document.getElementById('togglePoligonais').checked = false;
        if (map.hasLayer(poligonaisLayer)) map.removeLayer(poligonaisLayer); // Apenas para garantir
        console.log('renderLayersOnMap: Camada Poligonais carregada (mas invisível por padrão).'); 
    }
}

// Estilo dos lotes baseado no risco
function styleLotes(feature) {
    // Busca a propriedade de risco, normaliza para maiúscula inicial
    let risco = feature.properties.risco || feature.properties['Status Risco'] || 'N/A'; 
    if (risco && typeof risco === 'string') {
        risco = risco.trim().charAt(0).toUpperCase() + risco.trim().slice(1).toLowerCase();
    }
    
    // Mapeia "Geológico" para "Alto" para fins de cor e contagem
    if (risco === 'Geologico') {
        risco = 'Alto'; // Ou 'Muito Alto' se preferir mais impacto visual
    }
    
    const style = riscoStyles[risco] || riscoStyles['N/A']; 

    return {
        fillColor: style.fillColor,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachFeatureLotes(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        // Itera sobre todas as propriedades e adiciona ao popup
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === "") value = 'N/A'; // Trata valores nulos/indefinidos/vazios

            // Lógica para formatar campos específicos
            if (key.toLowerCase().includes('area') && typeof value === 'number') {
                value = value.toLocaleString('pt-BR') + ' m²';
            } else if (key.toLowerCase() === 'risco' || key.toLowerCase() === 'status risco') {
                // Formata a exibição do risco no popup
                if (value.toLowerCase() === 'geologico') {
                    value = 'Geológico (Risco Alto)'; 
                }
            } else if (key.toLowerCase() === 'dentro_app') { // Usa 'dentro_app'
                value = (value === 'Sim' || value === true) ? 'Sim' : 'Não';
            } else if (key.toLowerCase() === 'valor') { // Usa 'valor' para custo, se houver 'intervencao'
                if (feature.properties.intervencao && typeof value === 'number') {
                    value = 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    key = 'Custo de Intervenção (associado a ' + feature.properties.intervencao + ')'; // Renomeia e adiciona contexto
                }
            } else if (key.toLowerCase() === 'tipo_uso' && typeof value === 'string') {
                 value = value.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            }
            
            // Adiciona a propriedade e seu valor ao popup
            popupContent += `<strong>${key}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// 5. Atualiza o Dashboard
function updateDashboard(features) {
    console.log('updateDashboard: Atualizando cards do dashboard com', features.length, 'lotes.'); 
    document.getElementById('totalLotes').innerText = features.length;

    let lotesRiscoCount = 0; // Contagem geral de lotes em risco (que não são "Baixo")
    let lotesAppCount = 0; // Contagem de lotes em APP
    let custoTotal = 0; // Soma do custo
    
    // Contagem por categoria de risco para "Análise de Riscos"
    let riskCategoryCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 }; 

    features.forEach(feature => {
        // Lógica para 'risco': verifica 'risco' ou 'Status Risco'
        let riscoValue = feature.properties.risco || feature.properties['Status Risco'] || 'N/A'; 
        if (riscoValue && typeof riscoValue === 'string') {
            riscoValue = riscoValue.trim().charAt(0).toUpperCase() + riscoValue.trim().slice(1).toLowerCase();
        }
        
        // Mapeia "Geológico" para "Alto" para fins de contagem nos cards e seção "Análise de Riscos"
        if (riscoValue === 'Geologico') {
            riscoValue = 'Alto'; 
        }
        
        // Conta por categoria de risco para a seção "Análise de Riscos"
        if (riskCategoryCounts.hasOwnProperty(riscoValue)) { 
            riskCategoryCounts[riscoValue]++;
        } 
        
        // Contagem geral de lotes em risco (qualquer coisa que não seja "Baixo" ou "N/A")
        if (riscoValue !== 'Baixo' && riscoValue !== 'N/A') { 
            lotesRiscoCount++;
        }
        
        // CONTAGEM DE Lotes em APP: Usa a propriedade 'dentro_app'
        const appStatus = feature.properties.dentro_app; 
        if (appStatus === 'Sim' || appStatus === true) { 
            lotesAppCount++;
        }

        // CONTAGEM DE Custo de Intervenção: Usa a propriedade 'valor'
        // Assume que 'intervencao' e 'valor' andam juntos, e 'valor' é o custo numérico.
        if (feature.properties.intervencao && typeof feature.properties.valor === 'number') {
            custoTotal += feature.properties.valor;
        }
    });

    // Atualiza os cards principais do dashboard
    document.getElementById('lotesRisco').innerText = lotesRiscoCount;
    document.getElementById('lotesApp').innerText = lotesAppCount;
    document.getElementById('custoEstimado').innerText = custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Atualiza as contagens na seção "Análise de Riscos"
    document.getElementById('riskLowCount').innerText = riskCategoryCounts['Baixo'] || 0;
    document.getElementById('riskMediumCount').innerText = riskCategoryCounts['Médio'] || 0;
    document.getElementById('riskHighCount').innerText = riskCategoryCounts['Alto'] || 0;
    document.getElementById('riskVeryHighCount').innerText = riskCategoryCounts['Muito Alto'] || 0;

    // Atualiza o resumo de intervenções
    document.getElementById('areasIdentificadas').innerText = lotesRiscoCount; 
    document.getElementById('areasIntervencao').innerText = lotesRiscoCount; // Ajuste se a lógica de intervenção for diferente da identificação de risco
}

// 6. Preenche o Filtro de Núcleos
function populateNucleusFilter(nucleos) {
    console.log('populateNucleoFilter: Preenchendo filtro de núcleos.'); 
    const filterSelect = document.getElementById('nucleusFilter');
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            filterSelect.appendChild(option);
        });
    }

    // Preenche o filtro de núcleos do relatório também
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            reportNucleosSelect.appendChild(option);
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível. Faça o upload dos dados primeiro.</option>';
    }
}

// 7. Aplica Filtros no Dashboard (e mapa)
document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Aplicar Filtros" clicado.'); 
    const selectedNucleus = document.getElementById('nucleusFilter').value;
    let filteredFeatures = allLotesGeoJSON.features;

    if (selectedNucleus !== 'all') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.desc_nucleo === selectedNucleus);
    }

    // Re-renderiza a camada de lotes no mapa com os dados filtrados
    renderLayersOnMap(filteredFeatures);
    
    // Atualiza o dashboard com os dados filtrados
    updateDashboard(filteredFeatures);
    // Atualiza a tabela com dados filtrados
    updateLotesTable(filteredFeatures); 
});

// 8. Tabela de Lotes Detalhados
function updateLotesTable(features) {
    console.log('updateLotesTable: Atualizando tabela de lotes com', features.length, 'recursos.'); 
    const tableBody = document.querySelector('#lotesDataTable tbody');
    tableBody.innerHTML = ''; // Limpa a tabela

    if (features.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível. Faça o upload das camadas primeiro ou ajuste os filtros.</td></tr>';
        return;
    }

    features.forEach(feature => {
        const row = tableBody.insertRow();
        const props = feature.properties;

        row.insertCell().textContent = props.codigo || 'N/A';
        row.insertCell().textContent = props.desc_nucleo || 'N/A'; // Exibe o núcleo
        row.insertCell().textContent = (typeof props.tipo_uso === 'string') ? props.tipo_uso.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : 'N/A';
        row.insertCell().textContent = (props.area_m2 && typeof props.area_m2 === 'number') ? props.area_m2.toLocaleString('pt-BR') : 'N/A';
        
        // Lógica para exibir o risco na tabela
        let riscoTabela = props.risco || props['Status Risco'] || 'N/A';
        if (riscoTabela.toLowerCase() === 'geologico') {
            riscoTabela = 'Geológico'; // Exibe "Geológico" na tabela
        }
        row.insertCell().textContent = riscoTabela;

        // USA A PROPRIEDADE 'dentro_app' PARA EXIBIR O STATUS DE APP
        const appStatus = props.dentro_app; 
        row.insertCell().textContent = (appStatus === 'Sim' || appStatus === true) ? 'Sim' : 'Não';
        
        const actionsCell = row.insertCell();
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Ver no Mapa';
        viewBtn.className = 'small-btn'; 
        viewBtn.onclick = () => {
            document.querySelector('nav a[data-section="dashboard"]').click();
            if (lotesLayer) {
                lotesLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties && layer.feature.properties.codigo === props.codigo) {
                        map.setView(layer.getBounds().getCenter(), 18); 
                        layer.openPopup(); 
                    }
                });
            }
        };
        actionsCell.appendChild(viewBtn);
    });
}

// Busca na tabela
document.getElementById('lotSearch').addEventListener('keyup', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#lotesDataTable tbody tr');
    rows.forEach(row => {
        const textContent = row.textContent.toLowerCase();
        if (textContent.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

// Exportar Tabela para CSV
document.getElementById('exportTableBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Exportar Tabela" clicado.'); 
    const table = document.getElementById('lotesDataTable');
    let csv = [];
    // Cabeçalho
    const headerRow = [];
    table.querySelectorAll('thead th').forEach(th => {
        if (th.textContent !== 'Ações') { 
            headerRow.push(`"${th.textContent.trim()}"`); 
        }
    });
    csv.push(headerRow.join(';')); 

    // Linhas de dados
    table.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach((td, index) => {
            if (index < tr.querySelectorAll('td').length - 1) {
                let text = td.innerText.replace(/"/g, '""').replace(/\n/g, ' ').trim();
                row.push(`"${text}"`);
            }
        });
        csv.push(row.join(';'));
    });

    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'dados_lotes_geolaudo.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// FUNÇÃO: Coleta e Salva os dados do Formulário de Informações Gerais
function setupGeneralInfoForm() {
    console.log('setupGeneralInfoForm: Configurando formulário de informações gerais.'); 
    const saveButton = document.getElementById('saveGeneralInfoBtn');
    const statusMessage = document.getElementById('generalInfoStatus');

    saveButton.addEventListener('click', () => {
        console.log('Evento: Botão "Salvar Informações Gerais" clicado.'); 
        const getRadioValue = (name) => {
            const radios = document.getElementsByName(name);
            for (let i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return ''; 
        };

        generalProjectInfo = {
            ucConservacao: getRadioValue('ucConservacao'),
            protecaoMananciais: getRadioValue('protecaoMananciais'),
            tipoAbastecimento: document.getElementById('tipoAbastecimento').value.trim(),
            responsavelAbastecimento: document.getElementById('responsavelAbastecimento').value.trim(),
            tipoColetaEsgoto: document.getElementById('tipoColetaEsgoto').value.trim(),
            responsavelColetaEsgoto: document.getElementById('responsavelColetaEsgoto').value.trim(),
            sistemaDrenagem: getRadioValue('sistemaDrenagem'),
            drenagemInadequada: getRadioValue('drenagemInadequada'),
            logradourosIdentificados: getRadioValue('logradourosIdentificados'),
            
            linhaTransmissao: getRadioValue('linhaTransmissao'),
            minerodutoGasoduto: getRadioValue('minerodutoGasoduto'),
            linhaFerrea: getRadioValue('linhaFerrea'),
            aeroporto: getRadioValue('aeroporto'),
            limitacoesOutras: getRadioValue('limitacoesOutras'),
            processoMP: getRadioValue('processoMP'),
            processosJudiciais: getRadioValue('processosJudiciais'),
            comarcasCRI: document.getElementById('comarcasCRI').value.trim(),
            
            titularidadeArea: getRadioValue('titularidadeArea'),
            terraLegal: getRadioValue('terraLegal'),
            instrumentoJuridico: document.getElementById('instrumentoJuridico').value.trim(),
            legislacaoReurb: document.getElementById('legislacaoReurb').value.trim(),
            legislacaoAmbiental: getRadioValue('legislacaoAmbiental'),
            planoDiretor: getRadioValue('planoDiretor'),
            zoneamento: getRadioValue('zoneamento'),
            municipioOriginal: document.getElementById('municipioOriginal').value.trim(),
            matriculasOrigem: document.getElementById('matriculasOrigem').value.trim(),
            matriculasIdentificadas: document.getElementById('matriculasIdentificadas').value.trim(),

            adequacaoDesconformidades: getRadioValue('adequacaoDesconformidades'),
            obrasInfraestrutura: getRadioValue('obrasInfraestrutura'),
            medidasCompensatorias: getRadioValue('medidasCompensatorias')
        };

        statusMessage.textContent = 'Informações gerais salvas com sucesso!';
        statusMessage.className = 'status-message success';
        console.log('Informações Gerais Salvas:', generalProjectInfo); 
    });
}


// 9. Gerador de Relatórios com IA (Simulada)
document.getElementById('generateReportBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Gerar Relatório com IA" clicado.'); 
    const reportType = document.getElementById('reportType').value;
    const nucleosAnalise = document.getElementById('nucleosAnalise').value;
    const incDadosGerais = document.getElementById('incDadosGerais').checked;
    const incAnaliseRiscos = document.getElementById('incAnaliseRiscos').checked;
    const incAreasPublicas = document.getElementById('incAreasPublicas').checked;
    const incInformacoesGerais = document.getElementById('incInformacoesGerais').checked; 
    const incInfraestrutura = document.getElementById('incInfraestrutura').checked;
    const generatedReportContent = document.getElementById('generatedReportContent');

    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) {
        generatedReportContent.textContent = "Nenhum dado de lotes disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        return;
    }
    if (incInformacoesGerais && Object.keys(generalProjectInfo).length === 0) {
        generatedReportContent.textContent = "Seção 'Informações Gerais do Projeto' selecionada, mas nenhum dado foi salvo. Por favor, preencha e salve as informações na aba 'Informações Gerais'.";
        return;
    }

    let reportText = `RELATÓRIO GEOLAUDO.AI - ${reportType.toUpperCase()}\n`;
    reportText += `Data de Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

    let filteredFeatures = allLotesGeoJSON.features;
    if (nucleosAnalise !== 'all' && nucleosAnalise !== 'none') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.desc_nucleo === nucleosAnalise);
        reportText += `Análise Focada no Núcleo: ${nucleosAnalise}\n\n`;
    } else {
        reportText += `Análise Abrangente (Todos os Núcleos)\n\n`;
    }

    // Conteúdo do relatório baseado nas opções selecionadas (IA SIMULADA)
    if (incDadosGerais) {
        reportText += `--- 1. Dados Gerais da Área Analisada ---\n`;
        reportText += `Total de Lotes Analisados: ${filteredFeatures.length}\n`;
        
        const totalArea = filteredFeatures.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0);
        reportText += `Área Total dos Lotes: ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²\n\n`;

        const uniqueTiposUso = new Set(filteredFeatures.map(f => f.properties.tipo_uso).filter(Boolean));
        if (uniqueTiposUso.size > 0) {
            reportText += `Principais Tipos de Uso Identificados: ${Array.from(uniqueTiposUso).join(', ')}\n\n`;
        }
    }

    if (incAnaliseRiscos) {
        const riskCategoryCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };
        const otherRisks = {}; // Para riscos que não se encaixam nas categorias padrão

        filteredFeatures.forEach(f => {
            let riscoValue = f.properties.risco || f.properties['Status Risco'] || 'N/A'; 
            if (riscoValue && typeof riscoValue === 'string') {
                riscoValue = riscoValue.trim().charAt(0).toUpperCase() + riscoValue.trim().slice(1).toLowerCase(); // Capitalize
            }

            // Mapeia "Geológico" para "Alto" para o relatório
            if (riscoValue === 'Geologico') {
                riscoValue = 'Alto'; 
            }

            if (riskCategoryCounts.hasOwnProperty(riscoValue)) { 
                riskCategoryCounts[riscoValue]++;
            } else if (riscoValue !== 'N/A') { 
                if (otherRisks[riscoValue]) {
                    otherRisks[riscoValue]++;
                } else {
                    otherRisks[riscoValue] = 1;
                }
            }
        });

        const lotesComRiscoElevado = riskCategoryCounts['Médio'] + riskCategoryCounts['Alto'] + riskCategoryCounts['Muito Alto'] + Object.values(otherRisks).reduce((a, b) => a + b, 0);
        const percRiscoElevado = (lotesComRiscoElevado / filteredFeatures.length * 100 || 0).toFixed(2);

        reportText += `--- 2. Análise de Riscos Geológicos e Ambientais ---\n`;
        reportText += `Distribuição de Risco dos Lotes:\n`;
        reportText += `- Baixo Risco: ${riskCategoryCounts['Baixo'] || 0} lotes\n`;
        reportText += `- Médio Risco: ${riskCategoryCounts['Médio'] || 0} lotes\n`;
        reportText += `- Alto Risco: ${riskCategoryCounts['Alto'] || 0} lotes\n`;
        reportText += `- Muito Alto Risco: ${riskCategoryCounts['Muito Alto'] || 0} lotes\n`;
        
        // Adiciona outros tipos de risco encontrados (como "Geológico")
        for (const riskType in otherRisks) {
            reportText += `- ${riskType}: ${otherRisks[riskType]} lotes\n`;
        }
        reportText += `\n`;
        reportText += `Total de Lotes com Risco Elevado (considerando Médio, Alto, Muito Alto e Outros Tipos): ${lotesComRiscoElevado} (${percRiscoElevado}% do total)\n`;
        
        if (lotesComRiscoElevado > 0) {
            reportText += `Recomendação: Áreas com risco demandam estudos geotécnicos aprofundados e, possivelmente, intervenções estruturais para mitigação de riscos ou realocação, conforme a legislação vigente de REURB e plano de contingência municipal.\n\n`;
        } else {
            reportText += `Recomendação: A área analisada apresenta um perfil de baixo risco predominante, o que facilita o processo de regularização fundiária.\n\n`;
        }
    }

    if (incAreasPublicas) {
        // USA A PROPRIEDADE 'dentro_app' para APP
        const lotesEmAPP = filteredFeatures.filter(f => {
            const appStatus = f.properties.dentro_app; 
            return (appStatus === 'Sim' || appStatus === true); 
        }).length;

        reportText += `--- 3. Análise de Áreas de Preservação Permanente (APP) ---\n`;
        reportText += `Número de lotes que intersectam ou estão em APP: ${lotesEmAPP}\n`;
        if (lotesEmAPP > 0) {
            reportText += `Observação: A presença de lotes em Áreas de Preservação Permanente exige a aplicação de medidas específicas de regularização ambiental, como a recuperação da área degradada ou a compensação ambiental, conforme o Código Florestal e demais normativas ambientais aplicáveis à REURB.\n\n`;
        } else {
            reportText += `Observação: Não foram identificados lotes em Áreas de Preservação Permanente no conjunto de dados analisado, o que simplifica o licenciamento ambiental da regularização.\n\n`;
        }
    }

    // SEÇÃO: Informações Gerais do Projeto (Puxa do Formulário Manual)
    if (incInformacoesGerais && Object.keys(generalProjectInfo).length > 0) {
        const info = generalProjectInfo; 

        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        
        // Infraestrutura Básica
        reportText += `**Infraestrutura Básica:**\n`;
        reportText += `  - Unidades de Conservação Próximas: ${info.ucConservacao || 'Não informado'}.\n`;
        reportText += `  - Proteção de Mananciais na Área: ${info.protecaoMananciais || 'Não informado'}.\n`;
        reportText += `  - Abastecimento de Água: ${info.tipoAbastecimento || 'Não informado'}${info.responsavelAbastecimento ? ' (Responsável: ' + info.responsavelAbastecimento + ')' : ''}.\n`;
        reportText += `  - Coleta de Esgoto: ${info.tipoColetaEsgoto || 'Não informado'}${info.responsavelColetaEsgoto ? ' (Responsável: ' + info.responsavelColetaEsgoto + ')' : ''}.\n`;
        reportText += `  - Sistema de Drenagem: ${info.sistemaDrenagem || 'Não informado'}.\n`;
        reportText += `  - Lotes com Drenagem Inadequada: ${info.drenagemInadequada || 'Não informado'}.\n`;
        reportText += `  - Logradouros: ${info.logradourosIdentificados || 'Não informado'}.\n\n`;

        // Restrições e Conflitos
        reportText += `**Restrições e Conflitos:**\n`;
        if (info.linhaTransmissao === 'Sim' || info.minerodutoGasoduto === 'Sim' || info.linhaFerrea === 'Sim' || info.aeroporto === 'Sim' || info.limitacoesOutras === 'Sim') {
            reportText += `  - Foram identificadas as seguintes restrições/infraestruturas de grande porte:\n`;
            if (info.linhaTransmissao === 'Sim') reportText += `    - Linha de Transmissão de Energia.\n`;
            if (info.minerodutoGasoduto === 'Sim') reportText += `    - Mineroduto / Gasoduto.\n`;
            if (info.linhaFerrea === 'Sim') reportText += `    - Linha Férrea.\n`;
            if (info.aeroporto === 'Sim') reportText += `    - Proximidade de Aeroporto.\n`;
            if (info.limitacoesOutras === 'Sim') reportText += `    - Outras limitações de natureza diversa.\n`;
        } else {
            reportText += `  - Não foram identificadas restrições significativas de infraestruturas de grande porte ou outras limitações específicas.\n`;
        }
        reportText += `  - Processo no Ministério Público: ${info.processoMP || 'Não informado'}.\n`;
        reportText += `  - Processos Judiciais Existentes: ${info.processosJudiciais || 'Não informado'}.\n`;
        reportText += `  - Comarcas do CRI: ${info.comarcasCRI || 'Não informado/Não aplicável'}.\n\n`;

        // Aspectos Legais e Fundiários
        reportText += `**Aspectos Legais e Fundiários:**\n`;
        reportText += `  - Titularidade da Área: ${info.titularidadeArea || 'Não informado'}.\n`;
        reportText += `  - Programa Terra Legal: ${info.terraLegal || 'Não informado'}.\n`;
        reportText += `  - - Instrumento Jurídico Principal: ${info.instrumentoJuridico || 'Não informado'}.\n`;
        reportText += `  - Legislação Municipal REURB: ${info.legislacaoReurb || 'Não informada'}.\n`;
        reportText += `  - Legislação Municipal Ambiental: ${info.legislacaoAmbiental || 'Não informada'}.\n`;
        reportText += `  - Plano Diretor Municipal: ${info.planoDiretor || 'Não informado'}.\n`;
        reportText += `  - Lei de Uso e Ocupação do Solo/Zoneamento: ${info.zoneamento || 'Não informado'}.\n`;
        reportText += `  - Município de Origem do Núcleo: ${info.municipioOriginal || 'Não informado/Atual'}.\n`;
        reportText += `  - Matrículas de Origem/Afetadas: ${info.matriculasOrigem || 'Não informadas.'}\n`;
        reportText += `  - Matrículas Identificadas: ${info.matriculasIdentificadas || 'Não informadas.'}\n\n`;

        // Ações e Medidas Propostas
        reportText += `**Ações e Medidas Propostas:**\n`;
        reportText += `  - Adequação para Correção de Desconformidades: ${info.adequacaoDesconformidades || 'Não informado'}.\n`;
        reportText += `  - Obras de Infraestrutura Essencial: ${info.obrasInfraestrutura || 'Não informado'}.\n`;
        reportText += `  - Medidas Compensatórias: ${info.medidasCompensatorias || 'Não informado'}.\n\n`;

        reportText += `Esta seção reflete informações gerais sobre a área do projeto, essenciais para uma análise contextualizada e para a tomada de decisões no processo de REURB.\n\n`;
    } else if (incInformacoesGerais) {
        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        reportText += `Nenhuma informação geral foi preenchida ou salva na aba 'Informações Gerais'. Por favor, preencha os dados e clique em 'Salvar Informações Gerais' antes de gerar o relatório com esta seção.\n\n`;
    }


    if (incInfraestrutura && allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        reportText += `--- 5. Análise de Infraestrutura e Equipamentos Urbanos (Camadas Geoespaciais) ---\n`;
        reportText += `Foram detectadas ${allPoligonaisGeoJSON.features.length} poligonais de infraestrutura ou outras áreas de interesse (como vias, áreas verdes, equipamentos comunitários) nas camadas carregadas.\n`;
        reportText += `A presença e adequação da infraestrutura existente é um fator chave para a viabilidade e qualidade da regularização. Recomenda-se verificação detalhada da situação da infraestrutura básica (água, esgoto, energia, drenagem, acesso) em relação aos lotes.\n\n`;
    }
    
    // Custo de Intervenção (sempre incluído no final do relatório)
    const custoTotalFiltrado = filteredFeatures.reduce((acc, f) => {
        // USA A PROPRIEDADE 'valor' PARA O CUSTO.
        let custoValor = 0;
        if (typeof f.properties.valor === 'number') {
            custoValor = f.properties.valor;
        }
        return acc + custoValor;
    }, 0);

    reportText += `--- 6. Custo de Intervenção Estimado ---\n`;
    reportText += `Custo Total Estimado para Intervenção nos Lotes Analisados: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Este valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI. Para análises mais aprofundadas e validação legal, consulte um especialista qualificado e os órgãos competentes.`;

    generatedReportContent.textContent = reportText;
    generatedReportContent.scrollTop = 0; // Volta para o topo do relatório
});

// Exportar Relatório (botão no header)
document.getElementById('exportReportBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Exportar Relatório" clicado.'); 
    const reportContent = document.getElementById('generatedReportContent').textContent;
    if (reportContent.includes('Nenhum relatório gerado ainda') || reportContent.includes('Nenhum dado de lotes disponível')) {
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
