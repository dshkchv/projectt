import sqlite3

conn = sqlite3.connect('.\server\server_news\\finam_news.db')
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM finam_news")
print(f"Всего новостей: {cursor.fetchone()[0]}")

cursor.execute("SELECT id, title, pub_time FROM finam_news LIMIT 5")
for row in cursor.fetchall():
    print(f"ID: {row[0]}, Title: {row[1]}, Time: {row[2]}")

conn.close()