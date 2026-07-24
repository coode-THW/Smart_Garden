const fs = require('fs');
const path = require('path');

async function testLLM() {
  console.log('=== LLM API 测试 ===\n');

  const envPath = path.join(__dirname, '.env');
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
    console.log('读取 .env 文件成功');
  } catch (e) {
    console.error('❌ 无法读取 .env 文件:', e.message);
    return;
  }

  const qwenMatch = envContent.match(/QWEN_API_KEY=(.+)/);
  const doubaoMatch = envContent.match(/DOUBAO_API_KEY=(.+)/);
  
  const qwenKey = qwenMatch ? qwenMatch[1].trim() : '';
  const doubaoKey = doubaoMatch ? doubaoMatch[1].trim() : '';

  console.log(`QWEN_API_KEY: ${qwenKey ? '已配置' : '未配置'}`);
  console.log(`DOUBAO_API_KEY: ${doubaoKey ? '已配置' : '未配置'}`);

  if (!qwenKey && !doubaoKey) {
    console.error('\n❌ 请先在 .env 文件中配置 API Key');
    return;
  }

  console.log('\n--- 测试千问 API ---');
  if (qwenKey) {
    try {
      const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${qwenKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-vl-plus',
          messages: [{ role: 'user', content: [{ type: 'text', text: '你能否识别图片的信息' }] }],
          temperature: 0.1,
          max_tokens: 100,
        }),
        timeout: 15000,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '无响应内容';
        console.log('✅ 千问 API 调用成功');
        console.log('响应:', content.substring(0, 100), content.length > 100 ? '...' : '');
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`❌ 千问 API 调用失败: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error('❌ 千问 API 请求异常:', e.message);
    }
  }

  console.log('\n--- 测试豆包 API ---');
  if (doubaoKey) {
    try {
      const response = await fetch('https://api.doubao.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doubaoKey}`,
        },
        body: JSON.stringify({
          model: 'doubao-vl-128k',
          messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }],
          temperature: 0.1,
          max_tokens: 100,
        }),
        timeout: 15000,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '无响应内容';
        console.log('✅ 豆包 API 调用成功');
        console.log('响应:', content.substring(0, 100), content.length > 100 ? '...' : '');
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`❌ 豆包 API 调用失败: ${response.status} ${errorText}`);
      }
    } catch (e) {
      console.error('❌ 豆包 API 请求异常:', e.message);
    }
  }

  console.log('\n=== 测试完成 ===');
}

testLLM().catch(console.error);
