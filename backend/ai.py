import os
from datetime import datetime
from dotenv import load_dotenv
from mistralai import Mistral
from google import genai

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY not found in environment variables")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in environment variables")

main_ai_client = Mistral(api_key=MISTRAL_API_KEY)
token_embedding_client = genai.Client(api_key=GOOGLE_API_KEY)


def generate_reply(prompt, context=None):
    messages = []

    if context:
        context_text = (
            "Here are possibly relevant past conversations (most recent first):\n\n"
        )
        for item in reversed(context):
            role = item.get("role", "user")
            text = item.get("text", item) if isinstance(item, dict) else item
            timestamp = item.get("timestamp") if isinstance(item, dict) else None
            inherit_distance = (
                item.get("inherit_distance", 0) if isinstance(item, dict) else 0
            )

            time_info = ""
            if timestamp:
                try:
                    dt = datetime.fromisoformat(timestamp)
                    time_info = f" [{dt.strftime('%Y-%m-%d %H:%M')}]"
                except (ValueError, TypeError):
                    pass

            source_info = (
                f" (from parent session, distance={inherit_distance})"
                if inherit_distance > 0
                else ""
            )
            label = "User" if role == "user" else "Assistant"
            context_text += f"{label}{time_info}{source_info}: {text}\n"

        context_text += '\nBased on the above context, answer the user\'s question. Prioritize recent information over older memories. Inherited memories from parent sessions may be outdated.\nRemember, the information may not be relevant or helpful at all. Always check "Is it really relevant to what user is asking for now?".\n\n'
        print(f"=== CONTEXT SENT TO AI ===\n{context_text}")
        messages.append({"role": "system", "content": context_text})

    messages.append({"role": "user", "content": prompt})

    response = main_ai_client.chat.complete(
        model="mistral-large-latest",
        messages=messages,
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


def get_embedding(text):
    result = token_embedding_client.models.embed_content(
        model="gemini-embedding-001",
        contents=[text],
    )
    return list(result.embeddings[0].values)


def get_embeddings_batch(texts):
    if not texts:
        return []
    result = token_embedding_client.models.embed_content(
        model="gemini-embedding-001",
        contents=texts,
    )
    return [list(e.values) for e in result.embeddings]
