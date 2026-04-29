// Конфигурация приложения VK
const VK_APP_ID = 'ВАШ_APP_ID'; // Нужно заменить на свой!

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
    if (!VK_APP_ID || VK_APP_ID === 'ВАШ_APP_ID') {
        alert('Пожалуйста, укажите ваш APP_ID в файле script.js!');
        return;
    }
    
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://oauth.vk.com/authorize?` +
        `client_id=${VK_APP_ID}&` +
        `display=page&` +
        `redirect_uri=${redirectUri}&` +
        `scope=wall,likes,offline&` +
        `response_type=token&` +
        `v=5.131`;
    
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
        alert('Ошибка при проверке: ' + error.message);
        showStep('step2');
    }
}

// Основная функция проверки
async function checkSelfLikes(token, uid, count) {
    const results = [];
    
    // Получаем посты
    const postsResponse = await apiCall('wall.get', {
        owner_id: uid,
        count: count,
        filter: 'owner'
    }, token);
    
    if (!postsResponse.response || !postsResponse.response.items) {
        throw new Error('Не удалось получить посты');
    }
    
    const posts = postsResponse.response.items;
    const total = posts.length;
    
    // Проверяем каждый пост
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        
        // Обновляем прогресс
        const progress = Math.round((i / total) * 100);
        updateProgress(progress);
        
        try {
            // Проверяем лайк
            const likeResponse = await apiCall('likes.isLiked', {
                user_id: uid,
                type: 'post',
                owner_id: uid,
                item_id: post.id
            }, token);
            
            const liked = likeResponse.response.liked === 1;
            const reposted = likeResponse.response.reposted === 1;
            
            results.push({
                id: post.id,
                text: post.text || '[Без текста]',
                date: new Date(post.date * 1000),
                liked: liked,
                reposted: reposted,
                likesCount: post.likes ? post.likes.count : 0
            });
            
        } catch (error) {
            console.error(`Ошибка проверки поста ${post.id}:`, error);
            results.push({
                id: post.id,
                text: post.text || '[Без текста]',
                date: new Date(post.date * 1000),
                liked: false,
                error: true
            });
        }
        
        // Пауза, чтобы не превысить лимиты API
        await sleep(350);
    }
    
    updateProgress(100);
    return results;
}

// Вызов API VK
async function apiCall(method, params, token) {
    const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
    
    const url = `https://api.vk.com/method/${method}?${queryString}&access_token=${token}&v=5.131`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
        throw new Error(data.error.error_msg);
    }
    
    return data;
}

// Обновление прогресс-бара
function updateProgress(percent) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = percent + '%';
}

// Отображение результатов
function displayResults(results) {
    const selfLiked = results.filter(r => r.liked);
    const total = results.length;
    
    document.getElementById('totalPosts').textContent = total;
    document.getElementById('selfLikedPosts').textContent = selfLiked.length;
    
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = '';
    
    results.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = `post-item ${post.liked ? 'liked' : 'not-liked'}`;
        
        const truncatedText = post.text.length > 150 
            ? post.text.substring(0, 150) + '...' 
            : post.text;
        
        postElement.innerHTML = `
            <div class="post-text">${truncatedText}</div>
            <div class="post-meta">
                <span>${formatDate(post.date)}</span>
                <span>❤️ ${post.likesCount} лайков</span>
                <span class="like-status ${post.liked ? 'liked' : 'not-liked'}">
                    ${post.liked ? '✅ Ваш лайк' : '❌ Без лайка'}
                </span>
            </div>
        `;
        
        postsList.appendChild(postElement);
    });
    
    // Показываем результаты
    document.getElementById('step3').classList.remove('active');
    document.getElementById('results').classList.add('show');
}

// Форматирование даты
function formatDate(date) {
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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
