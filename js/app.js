// ===================== Estado Global do Aplicativo =====================
// Centraliza variáveis de estado para facilitar a organização e manutenção.
const state = {
    map: null,
    layers: { // FeatureGroups para gerenciar as camadas do Leaflet
        lotes: null, // Será inicializado como L.featureGroup() em initMap
        app: null,   // Será inicializado como L.featureGroup() em initMap
        poligonais: null // Será inicializado como L.featureGroup() em initMap
    },
    allLotes: [],           // Array de todas as feições de lotes carregadas
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


/** Garante que um anel de polígono seja fechado (primeiro e último ponto iguais). */
function ensurePolygonClosed(coords) {
    if (!coords || coords.length === 0) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
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
    return [p[0], p[1]]; // [longitude, latitude]
}

/**
 * Converte um GeoJSON inteiro de UTM para WGS84.
 */
function reprojectGeoJSONFromUTM(geojson, zone, south) {
    const converted = JSON.parse(JSON.stringify(geojson)); 

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;

        if (geomType === 'Point') {
            return utmToLngLat(coords[0], coords[1], zone, south);
        } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
            return coords.map(coord => utmToLngLat(coord[0], coord[1], zone, south));
        } else if (geomType === 'Polygon') {
            return coords.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))));
        } else if (geomType === 'MultiLineString') {
            return coords.map(line => line.map(coord => utmToLngLat(coord[0], coord[1], zone, south)));
        } else if (geomType === 'MultiPolygon') {
            return coords.map(polygon => 
                polygon.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))))
            );
        }
        return coords; 
    }

    if (converted.type === 'FeatureCollection') {
        converted.features = converted.features.map(feature => {
            if (feature.geometry) {
                feature.geometry.coordinates = convertGeometryCoords(feature.geometry.coordinates, feature.geometry.type);
            }
            return feature;
        });
    } else if (converted.type === 'Feature') {
        if (converted.geometry) {
            converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type);
        }
    } else { // Assume que é um objeto de geometria
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
};

/** Simula a busca de dados do IBGE para um município. */
function getSimulatedMunicipioData(nomeMunicipio) {
    const data = ibgeDataSimulado[nomeMunicipio];
    if (data) {
        return data;
    }
    return {
        municipio: nomeMunicipio,
        regiao: "Não informado",
        populacao: "N/D (Dados simulados)",
        area_km2: "N/D (Dados simulados)"
    };
}

/** Simula a geração de um laudo com IA no navegador. */
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

    laudo += `**Análise Contextual:**\n`;
    laudo += `Baseado nos dados fornecidos e em conhecimentos gerais de REURB, a área apresenta características urbanísticas e fundiárias que demandam avaliação conforme a legislação. A infraestrutura básica e a regularidade documental são pontos cruciais para a consolidação da regularização.\n\n`;

    laudo += `**Recomendações:**\n`;
    laudo += `1. Verificação documental aprofundada dos títulos e matrículas.\n`;
    laudo += `2. Levantamento topográfico e cadastral detalhado para delimitação precisa dos lotes.\n`;
    laudo += `3. Análise ambiental para identificar e mitigar impactos, especialmente em áreas de preservação.\n`;
    laudo += `4. Planejamento de obras de infraestrutura quando necessário.\n\n`;

    laudo += `Este laudo é uma simulação e deve ser complementado por uma análise técnica e jurídica completa realizada por profissionais habilitados.\n\n`;

    return laudo;
}


// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    // Camadas base (tiles)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(state.map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, 
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(state.map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Inicializa os FeatureGroups vazios e os adiciona ao mapa
    state.layers.lotes = L.featureGroup().addTo(state.map);
    state.layers.app = L.featureGroup().addTo(state.map); 
    state.layers.poligonais = L.featureGroup().addTo(state.map); 

    state.map.removeLayer(state.layers.app);
    state.map.removeLayer(state.layers.poligonais);

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

            document.querySelectorAll('main section').forEach(section => {
                section.classList.remove('active');
            });
            document.querySelectorAll('nav a').forEach(navLink => {
                navLink.classList.remove('active');
            });

            document.getElementById(targetSectionId).classList.add('active');
            this.classList.add('active');

            if (targetSectionId === 'dashboard' && state.map) {
                console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
                state.map.invalidateSize();
            }
            if (targetSectionId === 'dados-lotes') {
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

    // **CORREÇÃO AQUI**: Seleciona o botão visível PELO SEU ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton');

    // Elementos da UI de Reprojeção UTM
    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    useUtmCheckbox.addEventListener('change', () => {
        state.utmOptions.useUtm = useUtmCheckbox.checked;
        utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
    });
    utmZoneInput.addEventListener('input', () => { 
        state.utmOptions.zone = Number(utmZoneInput.value) || 23; 
    });
    utmHemisphereSelect.addEventListener('change', () => { 
        state.utmOptions.south = (utmHemisphereSelect.value === 'S'); 
    });

    // **CORREÇÃO AQUI**: Adiciona um listener de clique ao botão visível para disparar o clique no input de arquivo oculto
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado.'); 
            fileInput.click();
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    // Listener para quando arquivos são selecionados no input de arquivo
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        const selectedFilesArray = Array.from(e.target.files);
        if (selectedFilesArray.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = ''; 
            selectedFilesArray.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    });

    // Listener para arrastar e soltar (na área de drag-drop)
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
        const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        fileInput.files = createFileList(droppedFiles); 
        fileInput.dispatchEvent(new Event('change')); 
    });

    // Função auxiliar para criar uma FileList (necessário para drag and drop em alguns navegadores)
    function createFileList(files) {
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        return dataTransfer.files;
    }


    // Listener para o botão "Processar e Carregar Dados"
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

        state.layers.lotes.clearLayers();
        state.layers.app.clearLayers();
        state.layers.poligonais.clearLayers();
        state.allLotes = [];
        state.nucleusSet.clear();

        const newLotesFeatures = []; 
        const newAPPFeatures = [];   
        const newPoligonaisFeatures = []; 

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

                if (state.utmOptions.useUtm) {
                    console.log(`Tentando reprojetar ${file.name} de UTM para WGS84...`);
                    geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south);
                    console.log(`Reprojeção de ${file.name} concluída.`);
                }
                
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote')) { 
                    newLotesFeatures.push(...geojsonData.features);
                } else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) {
                console.error(`Erro ao carregar ou processar ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                return; 
            }
        }

        state.allLotes = newLotesFeatures; 
        newLotesFeatures.forEach(f => {
            if (f.properties && f.properties.desc_nucleo) { 
                state.nucleusSet.add(f.properties.desc_nucleo);
            }
        });
        
        L.geoJSON(newAPPFeatures, { onEachFeature: onEachAppFeature, style: styleApp }).addTo(state.layers.app);
        L.geoJSON(newPoligonaisFeatures, { onEachFeature: onEachPoligonalFeature, style: stylePoligonal }).addTo(state.layers.poligonais);
        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
                console.log('Mapa ajustado para os bounds dos dados carregados.');
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds. Verifique as coordenadas dos seus GeoJSONs.", e);
            }
        } else {
            state.map.setView([-15.7801, -47.9292], 5);
            console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
        }

        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}

// ===================== Estilos e Popups das Camadas Geoespaciais =====================

// Estilo dos lotes baseado no risco
function styleLote(feature) {
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase(); // Inclui 'grau'
    let color;
    if (risco.includes('baixo') || risco === '1') color = '#2ecc71';      
    else if (risco.includes('médio') || risco.includes('medio') || risco === '2') color = '#f1c40f'; // Amarelo
    else if (risco.includes('alto') && !risco.includes('muito') || risco === '3') color = '#e67e22'; // Laranja
    else if (risco.includes('muito alto') || risco === '4') color = '#c0392b'; 
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
                case 'custo de intervenção': displayKey = 'Custo de Intervenção'; break;
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
    info += `(Estes dados são simulados para demonstração client-side. Para dados reais, um backend seria necessário.)`;

    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}


// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos com:', Array.from(state.nucleusSet)); 
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
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível. Faça o upload dos dados primeiro.</option>';
    }
}

/** Filtra os lotes com base no núcleo selecionado. */
function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => {
        const nuc = (f.properties?.desc_nucleo || f.properties?.nucleo || '');
        return nuc === state.currentNucleusFilter;
    });
}

/** Aplica zoom ao mapa para a extensão dos lotes filtrados. */
function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) {
        state.map.setView([-15.7801, -47.9292], 5); 
        return;
    }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { state.map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch (e) {
        console.warn("Não foi possível ajustar o mapa ao filtro. Verifique as coordenadas dos lotes filtrados.", e);
    }
}

// ===================== Dashboard =====================
function refreshDashboard() {
    console.log('refreshDashboard: Atualizando cards do dashboard.');
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
        
        // **CORREÇÃO AQUI**: Lógica de contagem de risco mais robusta
        if (risco.includes('baixo') || risco === '1') riskCounts['Baixo']++;
        else if (risco.includes('médio') || risco.includes('medio') || risco === '2') riskCounts['Médio']++;
        else if (risco.includes('alto') && !risco.includes('muito') || risco === '3') riskCounts['Alto']++;
        else if (risco.includes('muito alto') || risco === '4') riskCounts['Muito Alto']++;
        else console.warn(`Risco não mapeado encontrado: "${risco}" para lote`, p); 

        if (risco.includes('alto') || risco === '3' || risco.includes('muito alto') || risco === '4') {
            lotesRiscoAltoMuitoAlto++;
        }
        
        const dentroApp = Number(p.dentro_app || p.app || 0); 
        if (dentroApp > 0) lotesAppCount++;

        const valorCusto = Number(p.valor || p.custo_intervencao || 0); 
        if (!isNaN(valorCusto) && valorCusto > 0) { 
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesRiscoAltoMuitoAlto; 
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal);

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
    console.log('fillLotesTable: Preenchendo tabela de lotes.');
    const tbody = document.querySelector('#lotesDataTable tbody');
    const feats = filteredLotes(); 
    tbody.innerHTML = ''; 

    if (feats.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7">Nenhum dado disponível. Faça o upload das camadas primeiro ou ajuste os filtros.</td>';
        tbody.appendChild(tr);
        return;
    }

    const fragment = document.createDocumentFragment();
    feats.forEach((f, idx) => {
        const p = f.properties || {};
        const tr = document.createElement('tr');

        const codLote = p.cod_lote || p.codigo || `Lote ${idx + 1}`; 
        const descNucleo = p.desc_nucleo || p.nucleo || 'N/A';
        const tipoUso = p.tipo_uso || 'N/A';
        const areaM2 = (p.area_m2 && typeof p.area_m2 === 'number') ? p.area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'N/A';
        const statusRisco = p.risco || p.status_risco || 'N/A'; 
        const emApp = (typeof p.dentro_app === 'number' && p.dentro_app > 0) ? 'Sim' : 'Não'; 
        
        const btnHtml = `<button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button>`;
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${descNucleo}</td>
            <td>${tipoUso}</td>
            <td>${areaM2}</td>
            <td>${statusRisco}</td>
            <td>${emApp}</td>
            <td>${btnHtml}</td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    // **CORREÇÃO AQUI**: Adiciona listeners para os botões "Ver no Mapa"
    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            const loteToZoom = state.allLotes.find(l => (l.properties?.cod_lote == codLoteToZoom)); // '==' para comparar string com número se necessário
            
            if (loteToZoom) {
                document.querySelector('nav a[data-sec
