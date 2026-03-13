import sys
import json
from underthesea import word_tokenize, pos_tag

def extract_keywords(text):
    if not text:
        return []
    
    # Tách từ sử dụng underthesea
    # words = word_tokenize(text)
    
    # Trích xuất keyword dựa trên cụm danh từ và động từ quan trọng
    # underthesea có hàm keyword_extraction nhưng đôi khi word_tokenize + lọc POS tốt hơn cho tên sản phẩm
    
    # Cách 1: Sử dụng word_tokenize và lọc theo POS (Part of Speech)
    tokens = pos_tag(text)
    
    # Các nhãn POS quan trọng: N (Noun), V (Verb), A (Adjective), NP (Noun phrase)
    # Chúng ta ưu tiên các tính từ và danh từ liên quan đến bệnh lý/sức khỏe
    important_tags = ['N', 'V', 'A', 'NP', 'M']
    
    keywords = []
    for word, tag in tokens:
        # Loại bỏ các từ quá ngắn hoặc stopwords cơ bản nếu cần
        clean_word = word.replace('_', ' ') # underthesea dùng _ nối các từ ghép
        if tag in important_tags and len(clean_word) > 2:
            keywords.append(clean_word.lower())
            
    # Cách 2: Sử dụng hàm trích xuất keyword có sẵn của underthesea (nếu phù hợp)
    # Tuy nhiên với tên sản phẩm ngắn, việc lọc theo POS thường chính xác hơn để lấy "giảm ho", "bổ phổi"
    
    # Loại bỏ trùng lặp và giữ nguyên thứ tự
    seen = set()
    unique_keywords = [x for x in keywords if not (x in seen or seen.add(x))]
    
    return unique_keywords

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        result = extract_keywords(input_text)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps([]))
