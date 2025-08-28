// ===================== Estado Global do Aplicativo =====================
// Centraliza variáveis de estado para facilitar a organização e manutenção.
const state = {
    map: null,
    layers: { // FeatureGroups para gerenciar as camadas do Leaflet
        lotes: null, 
        app: null,   
        poligonais: null,
        areasRisco: null // Camada para áreas de risco (lotes area de risco.geojson)
    },
    allLotes: [],           // Array de todas as feições de lotes carregadas
    allAPPGeoJSON: { type: 'FeatureCollection', features: [] }, 
    allPoligonaisGeoJSON: { type: 'FeatureCollection', features: [] }, 
    allAreasRiscoGeoJSON: { type: 'FeatureCollection', features: [] }, // Armazena as feições de áreas de risco
    nucleusSet: new Set(),  // Set para armazenar nomes de núcleos únicos
    currentNucleusFilter: 'all', // Núcleo selecionado no filtro do Dashboard
    utmOptions: { useUtm: false, zone: 23, south: true }, // Configurações para reprojeção UTM client-side
    generalProjectInfo: {}, // Informações gerais do projeto (preenchimento manual)
    lastReportText: '',     // Último relatório gerado (para exportação)
};

// ===================== Utilidades Diversas =====================

/** Formata um número para moeda BRL. */
function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Inicia o download de um arquivo de texto. */
function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Libera o objeto URL
}

/** Calcula a área de uma feature usando Turf.js. */
function featureAreaM2(feature) {
    try {
        // Turf.area retorna em metros quadrados se a projeção for WGS84
        return turf.area(feature);
    } catch (e) {
        console.warn('Erro ao calcular área com Turf.js:', e);
        return 0;
    }
}

/** Garante que um anel de polígono seja fechado (primeiro e último ponto iguais). */
function ensurePolygonClosed(coords) {
    if (!coords || coords.length === 0) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    // Se o primeiro e o último ponto não são iguais, adiciona o primeiro no final
    if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push(first);
    }
    return coords;
}

// ===================== Reprojeção UTM → WGS84 (client-side com proj4js) =====================
/** Converte um ponto UTM (x,y) para Lat/Lng (WGS84). */
function utmToLngLat(x, y, zone, south) {
    const def = `+proj=utm +zone=${Number(zone)} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
    const p = proj4(def, proj4.WGS84, [x, y]);
    return [p[0], p[1]]; 
}

/** Converte um GeoJSON inteiro de UTM para WGS84. */
function reprojectGeoJSONFromUTM(geojson, zone, south) {
    const converted = JSON.parse(JSON.stringify(geojson)); 

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;
        if (geomType === 'Point') return utmToLngLat(coords[0], coords[1], zone, south);
        if (geomType === 'LineString' || geomType === 'MultiPoint') return coords.map(coord => utmToLngLat(coord[0], coord[1], zone, south));
        if (geomType === 'Polygon') return coords.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))));
        if (geomType === 'MultiLineString') return coords.map(line => line.map(coord => utmToLngLat(coord[0], coord[1], zone, south)));
        if (geomType === 'MultiPolygon') return coords.map(polygon => polygon.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south)))));
        return coords;
    }

    if (converted.type === 'FeatureCollection') {
        converted.features = converted.features.map(feature => {
            if (feature.geometry) feature.geometry.coordinates = convertGeometryCoords(feature.geometry.coordinates, feature.geometry.type);
            return feature;
        });
    } else if (converted.type === 'Feature') {
        if (converted.geometry) converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type);
    } else {
        converted.coordinates = convertGeometryCoords(converted.coordinates, converted.type);
    }
    return converted;
}

// ===================== Simulações de IBGE e IA (para ambiente client-side) =====================
const ibgeDataSimulado = {
    "Conselheiro Lafaiete": {
        municipio: "Conselheiro Lafaiete",
        regiao: "Sudeste",
        populacao: "131.200 (estimativa 2023)",
        area_km2: "367.359"
    },
    "Diogo de Vasconcelos": { 
        municipio: "Diogo de Vasconcelos",
        regiao: "Sudeste",
        populacao: "4.000 (estimativa 2023)",
        area_km2: "165.123"
    },
    "Guarani": { // Adicionado conforme sua imagem anterior
        municipio: "Guarani",
        regiao: "Sudeste",
        populacao: "9.000 (estimativa 2023)",
        area_km2: "300"
    },
    "Rua Tiradentes": { // Exemplo adicionado para o seu filtro
        municipio: "Conselheiro Lafaiete", // Assumindo que a Rua Tiradentes está em Conselheiro Lafaiete
        regiao: "Sudeste",
        populacao: "N/D (Núcleo específico)",
        area_km2: "N/D (Núcleo específico)"
    },
    "Traversa Principal e Rua Padre Arlindo Vieira": { // Exemplo adicionado para o seu filtro
        municipio: "Conselheiro Lafaiete", // Assumindo que também está em Conselheiro Lafaiete
        regiao: "Sudeste",
        populacao: "N/D (Núcleo específico)",
        area_km2: "N/D (Núcleo específico)"
    }
    // Adicione mais dados simulados
};

function getSimulatedMunicipioData(nomeMunicipio) {
    const data = ibgeDataSimulado[nomeMunicipio];
    if (data) return data;
    return {
        municipio: nomeMunicipio, regiao: "Não informado", populacao: "N/D (Dados simulados)", area_km2: "N/D (Dados simulados)"
    };
}

function generateSimulatedAILaudo(promptData) {
    let laudo = `\n[RELATÓRIO GERADO POR IA - SIMULADO]\n\n`;
    laudo += `**Tema Principal:** ${promptData.tema}\n`;
    laudo += `**Detalhes da Análise:** ${promptData.detalhes}\n\n`;
    if (promptData.dados_ibge && promptData.dados_ibge.municipio) {
        laudo += `--- Dados IBGE para ${promptData.dados_ibge.municipio} ---\n`;
        laudo += `Região: ${promptData.dados_ibge.regiao}\n`;
        laudo += `População Estimada: ${promptData.dados_ibge.populacao}\n`;
        laudo += `Área Territorial: ${promptData.dados_ibge.area_km2} km²\n\n`;
    }
    laudo += `**Análise Contextual:**\nBaseado nos dados fornecidos e em conhecimentos gerais de REURB, a área apresenta características urbanísticas e fundiárias que demandam avaliação conforme a legislação. A infraestrutura básica e a regularidade documental são pontos cruciais para a consolidação da regularização.\n\n`;
    laudo += `**Recomendações:**\n1. Verificação documental aprofundada dos títulos e matrículas.\n2. Levantamento topográfico e cadastral detalhado para delimitação precisa dos lotes.\n3. Análise ambiental para identificar e mitigar impactos, especialmente em áreas de preservação.\n4. Planejamento de obras de infraestrutura quando necessário.\n\n`;
    laudo += `Este laudo é uma simulação e deve ser complementado por uma análise técnica e jurídica completa realizada por profissionais habilitados.\n\n`;
    return laudo;
}


// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(state.map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, 
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    const baseMaps = {"OpenStreetMap": osmLayer, "Esri World Imagery (Satélite)": esriWorldImagery};
    L.control.layers(baseMaps).addTo(state.map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    state.layers.lotes = L.featureGroup();
    state.layers.app = L.featureGroup(); 
    state.layers.poligonais = L.featureGroup(); 
    state.layers.areasRisco = L.featureGroup(); 

    // Adiciona ao mapa os FeatureGroups que deveriam estar visíveis por padrão, conforme os checkboxes
    document.getElementById('toggleLotes').checked = true; // Garante consistência
    state.layers.lotes.addTo(state.map); 
    
    // Outras camadas (APP, Poligonais, Áreas de Risco) não são adicionadas aqui inicialmente.
    // Elas serão adicionadas/removidas pelo user na legenda.

    state.map.invalidateSize(); 
    console.log('initMap: invalidateSize() chamado.'); 
}

// ===================== Navegação entre Seções =====================
function initNav() {
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');
            console.log(`Navegação: Clicado em ${targetSectionId}`); 

            document.querySelectorAll('main section').forEach(section => section.classList.remove('active'));
            document.querySelectorAll('nav a').forEach(navLink => navLink.classList.remove('active'));

            document.getElementById(targetSectionId).classList.add('active');
            this.classList.add('active');

            if (targetSectionId === 'dashboard' && state.map) {
                console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
                state.map.invalidateSize();
            }
            if (targetSectionId === 'dados-lotes') { // Preenche a tabela ao ativar a aba
                fillLotesTable();
            }
        });
    });
}

// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton'); 

    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    if (!fileInput) console.error('initUpload ERRO: #geojsonFileInput não encontrado!');
    if (!selectFilesVisibleButton) console.error('initUpload ERRO: #selectFilesVisibleButton não encontrado!');

    if (useUtmCheckbox) {
        useUtmCheckbox.addEventListener('change', () => {
            state.utmOptions.useUtm = useUtmCheckbox.checked;
            if (utmOptionsContainer) utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
            console.log(`UTM reprojection toggled: ${state.utmOptions.useUtm}`);
        });
    }
    if (utmZoneInput) utmZoneInput.addEventListener('input', () => { state.utmOptions.zone = Number(utmZoneInput.value) || 23; console.log(`UTM Zone set to: ${state.utmOptions.zone}`); });
    if (utmHemisphereSelect) utmHemisphereSelect.addEventListener('change', () => { state.utmOptions.south = (utmHemisphereSelect.value === 'S'); console.log(`UTM Hemisphere set to: ${state.utmOptions.south ? 'South' : 'Norte'}`); });

    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click();
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        const selectedFilesArray = Array.from(e.target.files);
        if (selectedFilesArray.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = '';
            selectedFilesArray.forEach(file => {
                const li = document.createElement('li'); li.textContent = file.name; fileListElement.appendChild(li);
            });
        }
    });

    dragDropArea.addEventListener('dragover', (e) => { e.preventDefault(); dragDropArea.classList.add('dragging'); });
    dragDropArea.addEventListener('dragleave', () => { dragDropArea.classList.remove('dragging'); });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault(); dragDropArea.classList.remove('dragging');
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.geojson') || f.name.endsWith('.json'));
        const dataTransfer = new DataTransfer();
        droppedFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change')); 
    });

    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        const filesToProcess = Array.from(fileInput.files || []);

        if (filesToProcess.length === 0) { uploadStatus.textContent = 'Nenhum arquivo para processar.'; uploadStatus.className = 'status-message error'; return; }

        uploadStatus.textContent = 'Processando e carregando dados...'; uploadStatus.className = 'status-message info';

        state.layers.lotes.clearLayers(); state.layers.app.clearLayers(); state.layers.poligonais.clearLayers(); state.layers.areasRisco.clearLayers();
        state.allLotes = []; state.allAPPGeoJSON.features = []; state.allPoligonaisGeoJSON.features = []; state.allAreasRiscoGeoJSON.features = []; state.nucleusSet.clear();

        const newLotesFeatures = []; const newAPPFeatures = []; const newPoligonaisFeatures = []; const newAreasRiscoFeatures = [];

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => { reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(e); reader.readAsText(file); });
                let geojsonData = JSON.parse(fileContent);

                if (state.utmOptions.useUtm && state.utmOptions.zone && (state.utmOptions.south !== undefined)) {
                    try { 
                        console.log(`Reprojetando ${file.name} de UTM para WGS84 (Zona ${state.utmOptions.zone}, Hemisfério ${state.utmOptions.south ? 'Sul' : 'Norte'})...`);
                        geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south); 
                        console.log(`Reprojeção de ${file.name} concluída.`); 
                    } catch (e) { 
                        console.error(`Falha na reprojeção de ${file.name}:`, e, geojsonData); 
                        uploadStatus.textContent = `Erro: Falha na reprojeção UTM de ${file.name}. Verifique a zona/hemisfério ou converta o arquivo previamente.`; 
                        uploadStatus.className = 'status-message error'; 
                        continue; 
                    }
                } else if (state.utmOptions.useUtm) {
                     console.warn(`Reprojeção UTM ativada, mas zona ou hemisfério não configurados. Pulando reprojeção para ${file.name}.`);
                }


                if (!geojsonData.type || !geojsonData.features) throw new Error('Arquivo GeoJSON inválido');
                if (geojsonData.type !== 'FeatureCollection') console.warn(`Arquivo ${file.name} não é um FeatureCollection`);

                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote') && !fileNameLower.includes('risco')) { 
                    newLotesFeatures.push(...geojsonData.features);
                    geojsonData.features.forEach(f => { if (f.properties && f.properties.desc_nucleo) state.nucleusSet.add(f.properties.desc_nucleo); });
                } else if (fileNameLower.includes('area de risco') || fileNameLower.includes('risco')) { 
                    newAreasRiscoFeatures.push(...geojsonData.features);
                }
                 else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) { 
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Detalhes: ${error.message}`; 
                uploadStatus.className = 'status-message error'; 
                continue;
            }
        }

        state.allLotes = newLotesFeatures; 
        state.allAPPGeoJSON.features = newAPPFeatures;
        state.allPoligonaisGeoJSON.features = newPoligonaisFeatures;
        state.allAreasRiscoGeoJSON.features = newAreasRiscoFeatures;
        
        renderLayersOnMap(); // Renderiza TUDO no mapa

        populateNucleusFilter(); 
        refreshDashboard();      
        fillLotesTable();        

        uploadStatus.textContent = 'Dados carregados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}

// ===================== Estilos e Popups das Camadas Geoespaciais =====================
function styleLote(feature) {
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase();
    let color;

    // Mapeamento de risco para cores
    switch (risco) {
        case '1':
        case 'baixo':
            color = '#2ecc71'; // Verde
            break;
        case '2':
        case 'médio':
        case 'medio':
            color = '#f1c40f'; // Amarelo
            break;
        case '3':
        case 'alto':
        case 'geologico':
        case 'hidrologico': // Incluindo 'geologico' e 'hidrologico' como Alto Risco
            color = '#e67e22'; // Laranja
            break;
        case '4':
        case 'muito alto':
            color = '#c0392b'; // Vermelho
            break;
        default:
            color = '#3498db'; // Azul padrão (para lotes sem risco definido)
            break;
    }

    return {
        fillColor: color,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
        fillOpacity: 0.7
    };
}

function onEachLoteFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A'; 
            if (key.toLowerCase() === 'area_m2' && typeof value === 'number') value = value.toLocaleString('pt-BR') + ' m²';
            if ((key.toLowerCase() === 'valor' || key.toLowerCase() === 'custo de intervenção') && typeof value === 'number') value = formatBRL(value);
            if (key.toLowerCase() === 'dentro_app' && typeof value === 'number') value = (value > 0) ? `Sim (${value}%)` : 'Não'; 

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

function styleApp(feature) { return { color: '#9b59b6', weight: 2, opacity: 0.7, fillColor: '#d7bde2', fillOpacity: 0.2 }; }
function onEachAppFeature(feature, layer) { if (feature.properties) { let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>"; for (let key in feature.properties) popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`; layer.bindPopup(popupContent); } }

function stylePoligonal(feature) { return { color: '#2ecc71', weight: 2, opacity: 0.7, fillOpacity: 0.2 }; }
async function onEachPoligonalFeature(feature, layer) {
    if (feature.properties) {
        const props = feature.properties;
        const municipioNome = props.municipio || props.nm_mun || 'Não informado'; 

        let popupContent = `<h3>Informações da Poligonal: ${municipioNome}</h3>`;
        popupContent += `<strong>Município:</strong> ${municipioNome}<br>`;
        if (props.area_m2) popupContent += `<strong>Área (m²):</strong> ${props.area_m2.toLocaleString('pt-BR')} m²<br>`;
        for (let key in props) { if (!['municipio', 'nm_mun', 'area_m2'].includes(key.toLowerCase())) popupContent += `<strong>${key}:</strong> ${props[key]}<br>`; }
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8px;">Ver informações do município</button>`;
        layer.bindPopup(popupContent);
    }
}

function buscarInfoCidade(nomeCidade) {
    alert(`Buscando dados simulados para ${nomeCidade}...`);
    const dadosSimulados = getSimulatedMunicipioData(nomeCidade); 
    let info = `**Informações para ${dadosSimulados.municipio}:**\n- Região: ${dadosSimulados.regiao}\n- População Estimada: ${dadosSimulados.populacao}\n- Área Territorial: ${dadosSimulados.area_km2} km²\n\n(Estes dados são simulados. Para dados reais, um backend seria necessário.)`;
    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}

// ===================== Renderização de Camadas no Mapa =====================
function renderLayersOnMap(featuresToDisplay = state.allLotes) {
    console.log('renderLayersOnMap: Renderizando camadas...');
    
    // Limpa todas as camadas antes de redesenhar
    state.layers.lotes.clearLayers();
    state.layers.app.clearLayers();
    state.layers.poligonais.clearLayers();
    state.layers.areasRisco.clearLayers();

    // Adiciona Lotes (filtrados ou todos)
    if (featuresToDisplay.length > 0) {
        L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachLoteFeature,
            style: styleLote
        }).addTo(state.layers.lotes);
        console.log(`renderLayersOnMap: ${featuresToDisplay.length} lotes adicionados à camada.`);
    }

    // Adiciona APP (todos os dados APP carregados)
    if (state.allAPPGeoJSON.features.length > 0) {
        L.geoJSON(state.allAPPGeoJSON.features, {
            onEachFeature: onEachAppFeature,
            style: styleApp
        }).addTo(state.layers.app);
        console.log(`renderLayersOnMap: ${state.allAPPGeoJSON.features.length} feições de APP adicionadas à camada.`);
    }

    // Adiciona Poligonais (todos os dados Poligonais carregados, exceto as áreas de risco específicas)
    if (state.allPoligonaisGeoJSON.features.length > 0) {
        L.geoJSON(state.allPoligonaisGeoJSON.features, {
            onEachFeature: onEachPoligonalFeature,
            style: stylePoligonal
        }).addTo(state.layers.poligonais);
        console.log(`renderLayersOnMap: ${state.allPoligonaisGeoJSON.features.length} feições de Poligonais adicionadas à camada.`);
    }

    // Adiciona Áreas de Risco (com estilo próprio)
    if (state.allAreasRiscoGeoJSON.features.length > 0) {
        L.geoJSON(state.allAreasRiscoGeoJSON.features, {
            onEachFeature: onEachAreaRiscoFeature, 
            style: styleAreaRisco 
        }).addTo(state.layers.areasRisco);
        console.log(`renderLayersOnMap: ${state.allAreasRiscoGeoJSON.features.length} feições de Áreas de Risco adicionadas à camada.`);
    }

    const allLayersGroupForBounds = L.featureGroup([
        state.layers.lotes, 
        state.layers.app, 
        state.layers.poligonais, 
        state.layers.areasRisco
    ].filter(fg => fg && fg.getLayers().length > 0 && fg.getBounds().isValid())); // Filtra FeatureGroups não vazios e com camadas

    if (allLayersGroupForBounds.getLayers().length > 0) {
        try {
            const bounds = allLayersGroupForBounds.getBounds();
            if (bounds.isValid()) {
                state.map.fitBounds(bounds, { padding: [50, 50] }); // Ajusta o zoom com padding
                console.log('Mapa ajustado para os bounds dos dados carregados:', bounds);
            } else {
                console.warn("Bounds inválidos (possivelmente coordenadas problemáticas). O mapa não será ajustado automaticamente. Verifique as coordenadas dos seus GeoJSONs.");
                state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
            }
        } catch (e) {
            console.error("Erro ao ajustar o mapa aos bounds. Verifique as coordenadas.", e);
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
        }
    } else {
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
        console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
    }
}

// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...'); 
    initMap(); 
    initNav(); 
    initUpload(); 
    initLegendToggles(); 
    initGeneralInfoForm(); 

    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        zoomToFilter();
    });

    document.getElementById('generateReportBtn').addEventListener('click', gerarRelatorioIA);

    document.getElementById('exportReportBtn').addEventListener('click', () => {
        if (!state.lastReportText.trim()) {
            alert('Nenhum relatório para exportar. Gere um relatório primeiro.');
            return;
        }
        downloadText('relatorio_geolaudo.txt', state.lastReportText);
    });
    
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); 
    });

    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    refreshDashboard(); 
    fillLotesTable(); 
    populateNucleusFilter(); 
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});

// ===================== Dashboard =====================
function refreshDashboard() {
    console.log('refreshDashboard: Atualizando cards do dashboard.');
    const feats = filteredLotes();
    const totalLotesCount = feats.length;

    let lotesEmRiscoGeral = 0; 
    let lotesAppCount = 0;
    let custoTotal = 0;
    let custoMin = Infinity; 
    let custoMax = -Infinity; 
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    feats.forEach(f => {
        const p = f.properties || {};
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        if (risco.includes('baixo') || risco === '1') {
            riskCounts['Baixo']++;
        } else if (risco.includes('médio') || risco.includes('medio') || risco === '2') {
            riskCounts['Médio']++;
        } else if (risco.includes('alto') || risco === '3' || risco.includes('geologico') || risco.includes('hidrologico')) {
            riskCounts['Alto']++;
        } else if (risco.includes('muito alto') || risco === '4') {
            riskCounts['Muito Alto']++;
        } else if (risco !== 'n/a' && risco.trim() !== '') {
            console.warn(`Risco não mapeado encontrado: "${risco}" para lote`, p);
        }
        
        if (risco !== '1' && !risco.includes('baixo') && risco !== 'n/a' && risco.trim() !== '') {
            lotesEmRiscoGeral++;
        }
        
        const dentroApp = Number(p.dentro_app || p.app || 0);
        if (dentroApp > 0) {
            lotesAppCount++;
        }

        const valorCusto = Number(p.valor || p.custo_intervencao || 0);
        if (!isNaN(valorCusto) && valorCusto > 0) {
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesEmRiscoGeral; 
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal);

    document.getElementById('riskLowCount').textContent = riskCounts['Baixo'];
    document.getElementById('riskMediumCount').textContent = riskCounts['Médio'];
    document.getElementById('riskHighCount').textContent = riskCounts['Alto'];
    document.getElementById('riskVeryHighCount').textContent = riskCounts['Muito Alto'];

    document.getElementById('areasIdentificadas').textContent = lotesEmRiscoGeral; 
    document.getElementById('areasIntervencao').textContent = lotesEmRiscoGeral; 

    document.getElementById('minCustoIntervencao').textContent = `Custo Mínimo de Intervenção: ${custoMin === Infinity ? 'N/D' : formatBRL(custoMin)}`;
    document.getElementById('maxCustoIntervencao').textContent = `Custo Máximo de Intervenção: ${custoMax === -Infinity ? 'N/D' : formatBRL(custoMax)}`;

    // A linha do Município Principal foi removida do HTML
}

// ===================== Tabela de Lotes =====================
function fillLotesTable() {
    console.log('fillLotesTable: Preenchendo tabela de lotes.');
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
        const codLote = p.cod_lote || p.codigo || 'N/A';
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${p.desc_nucleo || 'N/A'}</td>
            <td>${p.tipo_uso || 'N/A'}</td>
            <td>${p.area_m2 ? p.area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'N/A'}</td>
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
            const loteToZoom = state.allLotes.find(l => (l.properties?.cod_lote || l.properties?.codigo) == codLoteToZoom);
            
            if (loteToZoom) {
                document.querySelector('nav a[data-section="dashboard"]').click();
                
                const tempLayer = L.geoJSON(loteToZoom); 
                try { 
                    state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); 
                } catch (e) {
                    console.warn("Não foi possível ajustar o mapa ao lote selecionado. Verifique as coordenadas do lote.", e);
                }
                state.layers.lotes.eachLayer(layer => {
                    if ((layer.feature?.properties?.cod_lote || layer.feature?.properties?.codigo) == codLoteToZoom && layer.openPopup) {
                        layer.openPopup();
                    }
                });
            } else {
                console.warn(`Lote com código ${codLoteToZoom} não encontrado na lista para zoom.`);
            }
        });
    });

    const searchInput = document.getElementById('lotSearch');
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            const textContent = tr.textContent.toLowerCase();
            tr.style.display = textContent.includes(searchTerm) ? '' : 'none';
        });
    });

    document.getElementById('exportTableBtn').onclick = () => {
        const rows = [['Código','Núcleo','Tipo de Uso','Área (m²)','Status Risco','APP']];
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            if (tr.style.display === 'none') return; 
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 6) rows.push([
                tds[0].textContent, tds[1].textContent, tds[2].textContent,
                tds[3].textContent, tds[4].textContent, tds[5].textContent
            ]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
        downloadText('lotes_tabela.csv', csv);
    };
}
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        const filesToProcess = Array.from(fileInput.files || []);

        if (filesToProcess.length === 0) { 
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.'; 
            uploadStatus.className = 'status-message error'; 
            return; 
        }

        uploadStatus.textContent = 'Processando e carregando dados...'; 
        uploadStatus.className = 'status-message info';

        // Limpa TODOS os dados e camadas ANTES de iniciar o novo processamento
        state.layers.lotes.clearLayers(); 
        state.layers.app.clearLayers(); 
        state.layers.poligonais.clearLayers(); 
        state.layers.areasRisco.clearLayers(); 
        state.allLotes = []; 
        state.allAPPGeoJSON.features = []; 
        state.allPoligonaisGeoJSON.features = []; 
        state.allAreasRiscoGeoJSON.features = []; 
        state.nucleusSet.clear();

        const newLotesFeatures = []; 
        const newAPPFeatures = []; 
        const newPoligonaisFeatures = []; 
        const newAreasRiscoFeatures = [];

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => { 
                    reader.onload = (e) => resolve(e.target.result); 
                    reader.onerror = (e) => reject(e); 
                    reader.readAsText(file); 
                });
                let geojsonData = JSON.parse(fileContent);

                // **REPROJEÇÃO UTM SE O CHECKBOX ESTIVER MARCADO E OS CAMPOS PREENCHIDOS**
                if (state.utmOptions.useUtm && state.utmOptions.zone && (state.utmOptions.south !== undefined)) {
                    try { 
                        console.log(`Reprojetando ${file.name} de UTM para WGS84 (Zona ${state.utmOptions.zone}, Hemisfério ${state.utmOptions.south ? 'Sul' : 'Norte'})...`);
                        geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south); 
                        console.log(`Reprojeção de ${file.name} concluída.`); 
                    } catch (e) { 
                        console.error(`Falha na reprojeção de ${file.name}:`, e, geojsonData); 
                        uploadStatus.textContent = `Erro: Falha na reprojeção UTM de ${file.name}. Verifique a zona/hemisfério ou converta o arquivo previamente.`; 
                        uploadStatus.className = 'status-message error'; 
                        // Continua, mas com a mensagem de erro específica para o arquivo
                        continue; 
                    }
                } else if (state.utmOptions.useUtm) {
                     console.warn(`Reprojeção UTM ativada, mas zona ou hemisfério não configurados. Pulando reprojeção para ${file.name}.`);
                }

                if (!geojsonData.type || !geojsonData.features) throw new Error('Arquivo GeoJSON inválido');
                if (geojsonData.type !== 'FeatureCollection') console.warn(`Arquivo ${file.name} não é um FeatureCollection`);

                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote') && !fileNameLower.includes('risco')) { 
                    newLotesFeatures.push(...geojsonData.features);
                    geojsonData.features.forEach(f => { if (f.properties && f.properties.desc_nucleo) state.nucleusSet.add(f.properties.desc_nucleo); });
                } else if (fileNameLower.includes('area de risco') || fileNameLower.includes('risco')) { 
                    newAreasRiscoFeatures.push(...geojsonData.features);
                }
                 else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) { 
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Detalhes: ${error.message}`; 
                uploadStatus.className = 'status-message error'; 
                // Continua o laço para tentar processar outros arquivos mesmo se um falhar
                continue;
            }
        }

        // --- ATUALIZA O ESTADO GLOBAL COM OS DADOS PROCESSADOS ---
        state.allLotes = newLotesFeatures; 
        state.allAPPGeoJSON.features = newAPPFeatures;
        state.allPoligonaisGeoJSON.features = newPoligonaisFeatures;
        state.allAreasRiscoGeoJSON.features = newAreasRiscoFeatures;
        
        // --- RENDERIZAÇÃO NO MAPA E ATUALIZAÇÃO DA UI ---
        renderLayersOnMap(); // Renderiza TUDO no mapa (ela usará os dados de state)

        populateNucleusFilter(); // Popula o filtro com os núcleos coletados
        refreshDashboard();      // Atualiza o dashboard com os novos dados
        fillLotesTable();        // Preenche a tabela com os novos dados

        // Verifica se algum dado foi carregado para mostrar mensagem de sucesso
        if (state.allLotes.length > 0 || state.allAPPGeoJSON.features.length > 0 || state.allPoligonaisGeoJSON.features.length > 0 || state.allAreasRiscoGeoJSON.features.length > 0) {
             uploadStatus.textContent = 'Dados carregados com sucesso! Vá para o Dashboard ou Dados Lotes.';
             uploadStatus.className = 'status-message success';
        } else {
             uploadStatus.textContent = 'Nenhum dado válido foi carregado de nenhum arquivo GeoJSON.';
             uploadStatus.className = 'status-message error';
        }
        
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
