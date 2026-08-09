with shortened_introductions(activity_type, name, previous_introduction_md5, introduction) as (
  values
    ('室内', '打羽毛球', '19734ce3fc6dce98a2b14667bdd72852', '挥拍奔跑，甩掉沉闷'),
    ('室内', '星巴克下午茶', '35fca5d11ffc6e9c1041ca647590c3d6', '一杯咖啡，点亮午后'),
    ('室内', '打桌球', '39283f5dfc8baef9f931b97aba76e88a', '瞄准出杆，找回专注'),
    ('室内', '唱 K', '0d3bd393c1af8e7b7ae8a2c8fdc5bc2f', '放声唱歌，释放情绪'),
    ('室内', '游泳', '8cd5d64effe55e403eff2c331b938569', '入水舒展，划出力量'),
    ('室内', '滑雪', '8aa6cfed2d8116a672e3de99243346d5', '迎风俯冲，感受速度'),
    ('室内', '打网球', '29886f9bc6c77c58fc14317d30c949f3', '追球回击，点燃状态'),
    ('室内', '拳击', '42aeba554497aa0ebaed8fe1662c220c', '全力出拳，打散压力'),
    ('室内', '麦当劳吃早餐', '0b5ca406c38117624145c9ce8fdfa97c', '轻松早餐，愉快开场'),
    ('居家', '看电影', 'cd3f7056f3fb6c601c2e1846947b607e', '沉浸光影，好好放松'),
    ('居家', '爬坡', 'ce43719d73c3fd95f0f6f7a12976a15f', '持续向上，唤醒状态'),
    ('居家', '听播客', 'ddca74b88e0021f11b1940e14c8bb8f4', '听见新观点，独处有收获'),
    ('居家', '听广播剧', 'e116f6d0429780afbb00dd8d105079ea', '跟着声音入戏，展开想象'),
    ('居家', '看日剧', 'fb7b0f6a65d7416b202ae4a902bd61b1', '走进细腻故事，好好放松'),
    ('居家', 'AI 短剧', '771e0869e98677848c76a2530df394cb', '用AI脑洞，让灵感开演'),
    ('居家', '玩游戏 - 盛世天下', '9698d187823b916f1d31ce01977669da', '进入盛世天下，沉浸剧情'),
    ('户外', '红花湖骑行一圈', 'a53c7a96d1bc5c878caf7b95e1a27c33', '迎风绕湖，骑出畅快'),
    ('户外', '爬山', '53ed9856381cded427e9fd62e2893e29', '向高处出发，山风醒身心'),
    ('户外', '户外烧烤', '8d0b2e8371a8e68db32f9a4e71eb286e', '户外生火，烤出烟火气'),
    ('户外', '骑马', 'f5f1317ce30b75b8bbed2860eb43a31c', '翻身上马，自由向前')
)
update public.activity_items as item
set introduction = shortened.introduction
from shortened_introductions as shortened
where item.activity_type = shortened.activity_type
  and item.name = shortened.name
  and md5(btrim(coalesce(item.introduction, ''))) = shortened.previous_introduction_md5
  and char_length(shortened.introduction) <= 12;
