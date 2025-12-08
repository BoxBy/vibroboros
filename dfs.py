# DFS (깊이 우선 탐색) 구현

## 재귀적 구현
def dfs_recursive(graph, start, visited=None):
    if visited is None:
        visited = set()
    
    visited.add(start)
    print(start)  # 노드 방문 시 처리할 작업
    
    for neighbor in graph[start]:
        if neighbor not in visited:
            dfs_recursive(graph, neighbor, visited)
    
    return visited

## 스택을 이용한 반복적 구현
def dfs_iterative(graph, start):
    visited = set()
    stack = [start]
    
    while stack:
        node = stack.pop()
        if node not in visited:
            visited.add(node)
            print(node)  # 노드 방문 시 처리할 작업
            
            # 인접 노드를 스택에 추가 (역순으로 추가하여 왼쪽부터 처리되도록)
            for neighbor in reversed(graph[node]):
                if neighbor not in visited:
                    stack.append(neighbor)
    
    return visited

## 사용 예시
if __name__ == "__main__":
    # 그래프 표현 (딕셔너리로 인접 리스트 표현)
    graph = {
        'A': ['B', 'C'],
        'B': ['A', 'D', 'E'],
        'C': ['A', 'F'],
        'D': ['B'],
        'E': ['B', 'F'],
        'F': ['C', 'E']
    }

    print("재귀적 DFS:")
    dfs_recursive(graph, 'A')

    print("\n반복적 DFS:")
    dfs_iterative(graph, 'A')
