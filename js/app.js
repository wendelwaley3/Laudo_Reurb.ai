<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GeoLaudo.AI - Análise REURB</title>

    <!-- Google Fonts: Inter (para um visual moderno) -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Inclui o CSS do Leaflet (biblioteca de mapas) -->
    <!-- ATENÇÃO: Atributo 'integrity' REMOVIDO para evitar bloqueios do navegador. -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
    <!-- Inclui seu CSS personalizado -->
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header>
        <div class="logo">GeoLaudo.AI</div>
        <nav>
            <a href="#" data-section="dashboard" class="active">Dashboard</a>
            <a href="#" data-section="upload">Upload de Dados</a>
            <a href="#" data-section="informacoes-gerais">Informações Gerais</a>
            <a href="#" data-section="dados-lotes">Dados Lotes</a>
            <a href="#" data-section="relatorios">Relatórios</a>
            <a href="#" data-section="instrucoes">Instruções</a>
        </nav>
        <button id="exportReportBtn">Exportar Relatório</button>
    </header>

    <main>
        <!-- Dashboard Section -->
        <section id="dashboard" class="container active">
            <h2>Filtros de Análise</h2>
            <div class="filters">
                <select id="nucleusFilter">
                    <option value="all">Todos os Núcleos</option>
                    <!-- Opções de núcleo serão adicionadas via JS -->
                </select>
                <button id="applyFiltersBtn">Aplicar Filtros</button>
            </div>

            <div class="dashboard-cards">
                <div class="card">
                    <h3>Total de Lotes</h3>
                    <p id="totalLotes">0</p>
                    <span>lotes cadastrados</span>
                </div>
                <div class="card error">
                    <h3>Lotes em Risco</h3>
                    <p id="lotesRisco">0</p>
                    <span>do total</span>
                </div>
                <div class="card warning">
                    <h3>Lotes em APP</h3>
                    <p id="lotesApp">0</p>
                    <span>necessitam atenção</span>
                </div>
                <div class="card info">
                    <h3>Custo de Intervenção</h3>
                    <p>R$ <span id="custoEstimado">0,00</span></p>
                    <span>estimativa total</span>
                </div>
            </div>

            <h2>Visualização Geoespacial</h2>
            <div id="mapid"></div>

            <div class="map-legend">
                <h3>Legenda do Mapa</h3>
                <div class="legend-item"><input type="checkbox" id="toggleLotes" checked><label for="toggleLotes">Lotes</label> <span class="legend-color lotes"></span></div>
                <div class="legend-item"><input type="checkbox" id="togglePoligonais"><label for="togglePoligonais">Poligonais</label> <span class="legend-color poligonais"></span></div>
                <div class="legend-item"><input type="checkbox" id="toggleAPP"><label for="toggleAPP">APP</label> <span class="legend-color app"></span></div>

                <h4>Áreas de Risco:</h4>
                <ul>
                    <li class="risk-low">Baixo Risco (1)</li>
                    <li class="risk-medium">Médio Risco (2)</li>
                    <li class="risk-high">Alto Risco (3)</li>
                    <li class="risk-very-high">Muito Alto Risco (4)</li>
                </ul>
                <p class="click-info">Clique nos elementos do mapa para ver detalhes</p>
            </div>

            <h2>Análise de Riscos</h2>
            <ul class="risk-summary">
                <li class="risk-low">Baixo Risco: <span id="riskLowCount">0</span> lotes</li>
                <li class="risk-medium">Médio Risco: <span id="riskMediumCount">0</span> lotes</li>
                <li class="risk-high">Alto Risco: <span id="riskHighCount">0</span> lotes</li>
                <li class="risk-very-high">Muito Alto Risco: <span id="riskVeryHighCount">0</span> lotes</li>
            </ul>
            <h3>Resumo de Intervenções</h3>
            <ul>
                <li id="minCustoIntervencao">Custo Mínimo de Intervenção: R$ 0,00</li>
                <li id="maxCustoIntervencao">Custo Máximo de Intervenção: R$ 0,00</li>
                <li><span id="areasIdentificadas">0</span> áreas de risco identificadas</li>
                <li><span id="areasIntervencao">0</span> áreas demandam intervenção estrutural</li>
            </ul>

            <h2>Análise Comparativa por Núcleo</h2>
            <div id="nucleusComparisonChart" class="chart-container">
                <p>Nenhum dado disponível. Faça o upload das camadas para visualizar o gráfico.</p>
            </div>
        </section>

        <!-- Upload Section -->
        <section id="upload" class="container">
            <h2>Upload de Camadas GeoJSON</h2>
            <div class="upload-area">
                <!-- ESTRUTURA PARA UPLOAD CORRIGIDA: LABEL ENVOLVENDO TUDO -->
                <label class="drag-drop-area">
                    <p class="drag-text">Arraste e solte seus arquivos GeoJSON aqui</p>
                    <p>ou clique para selecionar</p>
                    <button type="button">Selecionar Arquivos</button>
                    <input type="file" id="geojsonFileInput" accept=".geojson,.json" multiple style="display: none;">
                </label>
            </div>
            <div class="uploaded-files-preview">
                <h3>Arquivos Selecionados:</h3>
                <ul id="fileList">
                    <li>Nenhum arquivo selecionado.</li>
                </ul>
            </div>
            <button id="processAndLoadBtn">Processar e Carregar Dados</button>
            <p id="uploadStatus" class="status-message"></p>
        </section>

        <!-- (O restante do HTML das outras abas continua igual) -->
        
    </main>

    <footer>
        <p>&copy; 2023 GeoLaudo.AI. Todos os direitos reservados.</p>
    </footer>

    <!-- Inclui o JS do Leaflet -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <!-- Inclui proj4js para definição de sistemas de coordenadas -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.8.0/proj4.min.js"></script>
    <script src="https://unpkg.com/proj4leaflet@1.0.2/src/proj4leaflet.js"></script>
    <!-- Inclui o Turf.js para operações geoespaciais client-side -->
    <script src="https://unpkg.com/turf@6.5.0/turf.min.js"></script>
    <!-- Inclui seu JS personalizado -->
    <script src="js/app.js"></script>
</body>
</html>
