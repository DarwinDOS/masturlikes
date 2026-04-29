// Конфигурация приложения VK
const VK_APP_ID = '54571106'; // Вставь сюда свои цифры!

let accessToken = null;
let userId = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, не вернулись ли мы после авторизации
    checkAuthCallback();
    
    // Обработчики кнопок
    document.getElementById('authButton').addEventListener('click', startAuth);
    document.getElementById('checkButton').addEventListener('click', startChecking);
    document.getElementById('newCheck').addEventListener('click', resetApp);
});

// Проверка callback после авторизации
function checkAuthCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    
    if (params.has('access_token')) {
        accessToken = params.get('access_token');
        userId = params.get('user_id');
        
        // Очищаем URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Показываем шаг 2
        showStep('step2');
    }
}

// Запуск авторизации
function startAuth() {
    if (!VK_APP_ID || VK_APP_ID === 'ТВОЙ_APP_ID') {
        alert('Пожалуйста, укажите ваш APP_ID в файле script.js!');
        return;
    }
    
    // Получаем текущий URL для redirect
    const redirectUri = window.location.href.split('#')[0]; // Убираем хеш если есть
    
    // Создаем URL для авторизации
    const authUrl = 'https://oauth.vk.com/authorize' +
        '?client_id=' + VK_APP_ID +
        '&display=page' +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=wall,offline' +  // Убираем likes из scope!
        '&response_type=token' +
        '&v=5.199' +
        '&state=random_state_' + Math.random();
    
    console.log('Редирект на:', authUrl); // Для отладки
    window.location.href = authUrl;
}

// Переключение шагов
function showStep(stepId) {
    const steps = ['step1', 'step2', 'step3'];
    const results = document.getElementById('results');
    
    steps.forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
    results.classList.remove('show');
    
    if (stepId !== 'results') {
        document.getElementById(stepId).classList.add('active');
    }
}

// Запуск проверки
async function startChecking() {
    showStep('step3');
    
    const postCount = document.getElementById('postCount').value;
    
    try {
        const results = await checkSelfLikes(accessToken, userId, postCount);
        displayResults(results);
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при проверке: ' + error.message);
        showStep('step2');
    }
}

// Основная функция проверки
async function checkSelfLikes(token, uid, count) {
    const results = [];
    
    // Получаем посты
    console.log('Получаем посты...');
    const postsResponse = await apiCall('wall.get', {
        owner_id: uid,
        count: count,
        filter: 'owner',
        extended: 0
    }, token);
    
    if (!postsResponse.response || !postsResponse.response.items) {
        throw new Error('Не удалось получить посты');
    }
    
    const posts = postsResponse.response.items;
    const total = posts.length;
    console.log('Найдено постов:', total);
    
    if (total === 0) {
        throw new Error('У вас нет постов на стене');
    }
    
    // Проверяем каждый пост
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        
        // Обновляем прогресс
        const progress = Math.round(((i + 1) / total) * 100);
        updateProgress(progress);
        
        try {
            // Пробуем метод likes.isLiked
            console.log('Проверяем пост', post.id);
            
            const likeResponse = await apiCall('likes.isLiked', {
                user_id: uid,
                type: 'post',
                owner_id: uid,
                item_id: post.id
            }, token);
            
            const liked = likeResponse.response.liked === 1;
            
            results.push({
                id: post.id,
                text: post.text || '[Без текста]',
                date: new Date(post.date * 1000),
                liked: liked,
                likesCount: post.likes ? post.likes.count : 0,
                error: false
            });
            
        } catch (error) {
            console.error('Ошибка для поста ' + post.id + ':', error);
            
            // Альтернативный метод - получаем всех лайкнувших и проверяем
            try {
                console.log('Пробуем альтернативный метод...');
                const likesListResponse = await apiCall('likes.getList', {
                    type: 'post',
                    owner_id: uid,
                    item_id: post.id,
                    count: 1000,
                    skip_own: 0
                }, token);
                
                const likedUsers = likesListResponse.response?.items || [];
                const liked = likedUsers.includes(parseInt(uid));
                
                results.push({
                    id: post.id,
                    text: post.text || '[Без текста]',
                    date: new Date(post.date * 1000),
                    liked: liked,
                    likesCount: likesListResponse.response?.count || 0,
                    error: false
                });
                
            } catch (secondError) {
                console.error('Оба метода не сработали:', secondError);
                results.push({
                    id: post.id,
                    text: post.text || '[Без текста]',
                    date: new Date(post.date * 1000),
                    liked: null,
                    likesCount: post.likes ? post.likes.count : 0,
                    error: true,
                    errorMsg: 'Не удалось проверить'
                });
            }
        }
        
        // Пауза между запросами
        if (i < posts.length - 1) {
            await sleep(350);
        }
    }
    
    updateProgress(100);
    console.log('Проверка завершена. Результатов:', results.length);
    return results;
}

// Вызов API VK
async function apiCall(method, params, token) {
    const queryParams = new URLSearchParams({
        ...params,
        access_token: token,
        v: '5.199'
    });
    
    const url = 'https://api.vk.com/method/' + method + '?' + queryParams.toString();
    
    console.log('API запрос:', method); // Для отладки
    
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('HTTP ошибка: ' + response.status);
    }
    
    const data = await response.json();
    
    if (data.error) {
        console.error('API ошибка:', data.error);
        throw new Error(data.error.error_msg || 'Неизвестная ошибка API');
    }
    
    return data;
}

// Обновление прогресс-бара
function updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    
    if (fill) fill.style.width = percent + '%';
    if (text) text.textContent = percent + '%';
}

// Отображение результатов
function displayResults(results) {
    const selfLiked = results.filter(r => r.liked === true);
    const errors = results.filter(r => r.error === true);
    const total = results.length;
    
    document.getElementById('totalPosts').textContent = total;
    document.getElementById('selfLikedPosts').textContent = selfLiked.length;
    
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = '';
    
    if (results.length === 0) {
        postsList.innerHTML = '<p>Нет данных для отображения</p>';
    }
    
    results.forEach(post => {
        const postElement = document.createElement('div');
        
        if (post.error) {
            postElement.className = 'post-item error';
            postElement.innerHTML = `
                <div class="post-text">${escapeHtml(post.text)}</div>
                <div class="post-meta">
                    <span>${formatDate(post.date)}</span>
                    <span>❤️ ${post.likesCount} лайков</span>
                    <span class="like-status error">⚠️ Ошибка проверки</span>
                </div>
            `;
        } else {
            postElement.className = `post-item ${post.liked ? 'liked' : 'not-liked'}`;
            
            const truncatedText = post.text && post.text.length > 150 
                ? post.text.substring(0, 150) + '...' 
                : post.text || '[Без текста]';
            
            postElement.innerHTML = `
                <div class="post-text">${escapeHtml(truncatedText)}</div>
                <div class="post-meta">
                    <span>${formatDate(post.date)}</span>
                    <span>❤️ ${post.likesCount} лайков</span>
                    <span class="like-status ${post.liked ? 'liked' : 'not-liked'}">
                        ${post.liked ? '✅ Ваш лайк' : '❌ Без лайка'}
                    </span>
                </div>
            `;
        }
        
        postsList.appendChild(postElement);
    });
    
    // Показываем результаты
    document.getElementById('step3').classList.remove('active');
    document.getElementById('results').classList.add('show');
}

// Функция для безопасного вывода текста
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Форматирование даты
function formatDate(date) {
    if (!date) return 'Неизвестная дата';
    try {
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Неизвестная дата';
    }
}

// Пауза
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Сброс приложения
function resetApp() {
    accessToken = null;
    userId = null;
    document.getElementById('results').classList.remove('show');
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
    showStep('step2');
}
